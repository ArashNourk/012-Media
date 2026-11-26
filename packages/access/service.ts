import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { newId, sha256 } from '../contracts';
import type { Mailer } from '../connectors/mail/mailer';
import type { Repository } from '../persistence/repository';
import { unsubscribeUrl } from '../publishing/unsubscribe';
import { verificationEmail, welcomeEmail } from './emails';
import { ApplicationInput, CONSENT, CONSENT_SHA256, FOUNDING, normalizeEmail } from './policy';

export interface AccessConfig {
  siteUrl: string;
  fromAddress: string;
  replyTo?: string;
  publisherIdentity: string;
  unsubscribeSecret: string;
  formSecret: string;
  verificationTtlHours?: number;
}

export type ApplicationStatus = 'applied' | 'email_verified' | 'pending_review' | 'approved' | 'declined' | 'waitlisted' | 'withdrawn';

export interface ApplicationRecord {
  id: string;
  email: string;
  emailNormalized: string;
  fullName: string;
  roleTitle: string;
  industry: string;
  linkedinUrl: string | null;
  status: ApplicationStatus;
  consentTextVersion: string;
  consentAt: string;
  emailVerifiedAt: string | null;
  applicationDate: string;
  reviewer: string | null;
  reviewDate: string | null;
  reviewNote: string | null;
  subscriberId: string | null;
}

export class AccessError extends Error {}
export class FoundingCohortFullError extends AccessError {}

/** The response to every submission is identical, so the form never reveals whether an address is known. */
export const RECEIVED_MESSAGE =
  'Request received. We have sent a confirmation link to the address you entered. Every request is reviewed individually; we will write to you if it is approved.';

/**
 * Invitation journey (PRD §6):
 * applied → (email verified) → pending_review → approved | declined | waitlisted → subscribed.
 * Nothing is mailed before a complete application with express consent, and
 * only approved, consented, verified readers become subscribers.
 */
export class AccessService {
  constructor(
    private repo: Repository,
    private mailer: Mailer,
    private cfg: AccessConfig,
  ) {}

  private get db() {
    return this.repo.db;
  }

  // ------------------------------------------------------------ form tokens (CSRF / bot friction)

  /** Signed, time-stamped token embedded in the page. Valid between 2 seconds and 2 hours after issue. */
  issueFormToken(now = Date.now()): string {
    const ts = String(now);
    return `${ts}.${createHmac('sha256', this.cfg.formSecret).update(`form:${ts}`).digest('base64url')}`;
  }

  checkFormToken(token: unknown, now = Date.now()): boolean {
    if (typeof token !== 'string') return false;
    const [ts, sig] = token.split('.');
    if (!ts || !sig) return false;
    const expected = createHmac('sha256', this.cfg.formSecret).update(`form:${ts}`).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    const age = now - Number(ts);
    return age >= 2_000 && age <= 2 * 3_600_000;
  }

  // ------------------------------------------------------------ records

  private map(r: Record<string, unknown>): ApplicationRecord {
    return {
      id: String(r.id),
      email: String(r.email),
      emailNormalized: String(r.email_normalized),
      fullName: String(r.full_name),
      roleTitle: String(r.role_title),
      industry: String(r.industry),
      linkedinUrl: (r.linkedin_url as string) || null,
      status: r.status as ApplicationStatus,
      consentTextVersion: String(r.consent_text_version),
      consentAt: String(r.consent_at),
      emailVerifiedAt: (r.email_verified_at as string) ?? null,
      applicationDate: String(r.application_date),
      reviewer: (r.reviewer as string) ?? null,
      reviewDate: (r.review_date as string) ?? null,
      reviewNote: (r.review_note as string) ?? null,
      subscriberId: (r.subscriber_id as string) ?? null,
    };
  }

  getApplication(id: string): ApplicationRecord | undefined {
    const r = this.db.prepare('SELECT * FROM applications WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return r ? this.map(r) : undefined;
  }

  findByEmail(email: string): ApplicationRecord | undefined {
    const r = this.db.prepare('SELECT * FROM applications WHERE email_normalized = ?').get(normalizeEmail(email)) as Record<string, unknown> | undefined;
    return r ? this.map(r) : undefined;
  }

  listApplications(status?: ApplicationStatus): ApplicationRecord[] {
    const rows = (status
      ? this.db.prepare('SELECT * FROM applications WHERE status = ? ORDER BY application_date').all(status)
      : this.db.prepare('SELECT * FROM applications ORDER BY application_date').all()) as Record<string, unknown>[];
    return rows.map((r) => this.map(r));
  }

  foundingSeatsTaken(): number {
    return Number((this.db.prepare('SELECT COUNT(*) n FROM founding_seats').get() as { n: number }).n);
  }

  private setStatus(id: string, status: ApplicationStatus, actor: string, extra: Record<string, string | null> = {}) {
    const cols = Object.keys(extra);
    this.db
      .prepare(`UPDATE applications SET status = ?, updated_at = ?${cols.map((c) => `, ${c} = ?`).join('')} WHERE id = ?`)
      .run(status, this.repo.now(), ...cols.map((c) => extra[c]), id);
    this.repo.audit(actor, `application.${status}`, id);
  }

  // ------------------------------------------------------------ step 2–3: submit + verify

  /**
   * Validate and store an application, then send a single ownership-confirmation
   * email. Returns field errors for invalid input; otherwise always the same
   * generic acknowledgement (no enumeration of existing addresses).
   */
  async submit(raw: unknown): Promise<{ ok: true; message: string } | { ok: false; errors: Record<string, string> }> {
    const parsed = ApplicationInput.safeParse(raw);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const i of parsed.error.issues) errors[String(i.path[0] ?? 'form')] ??= i.message;
      return { ok: false, errors };
    }
    const a = parsed.data;
    const now = this.repo.now();
    const existing = this.findByEmail(a.email);
    let app: ApplicationRecord;
    if (existing) {
      // Re-applying never changes an approved, declined or waitlisted decision, and is never disclosed.
      if (existing.status !== 'applied') {
        this.repo.audit('access', 'application.duplicate_ignored', existing.id);
        return { ok: true, message: RECEIVED_MESSAGE };
      }
      const recent = this.db
        .prepare(`SELECT 1 FROM verification_tokens WHERE application_id = ? AND created_at > ?`)
        .get(existing.id, new Date(Date.parse(now) - 10 * 60_000).toISOString());
      if (recent) return { ok: true, message: RECEIVED_MESSAGE };
      this.db
        .prepare('UPDATE applications SET full_name = ?, role_title = ?, industry = ?, linkedin_url = ?, consent_text_version = ?, consent_text_sha256 = ?, consent_at = ?, updated_at = ? WHERE id = ?')
        .run(a.fullName, a.roleTitle, a.industry, a.linkedinUrl || null, CONSENT.version, CONSENT_SHA256, now, now, existing.id);
      app = this.getApplication(existing.id)!;
    } else {
      const id = newId('application');
      this.db
        .prepare(
          `INSERT INTO applications (id, email_normalized, email, full_name, role_title, industry, linkedin_url, status, consent_text_version, consent_text_sha256, consent_at, application_date, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(id, normalizeEmail(a.email), a.email, a.fullName, a.roleTitle, a.industry, a.linkedinUrl || null, 'applied', CONSENT.version, CONSENT_SHA256, now, now, now);
      this.repo.audit('access', 'application.applied', id, { consentVersion: CONSENT.version });
      app = this.getApplication(id)!;
    }
    await this.sendVerification(app);
    return { ok: true, message: RECEIVED_MESSAGE };
  }

  private async sendVerification(app: ApplicationRecord) {
    const token = randomBytes(32).toString('base64url');
    const now = this.repo.now();
    const ttl = (this.cfg.verificationTtlHours ?? 48) * 3_600_000;
    this.db
      .prepare('INSERT INTO verification_tokens (token_sha256, application_id, purpose, expires_at, created_at) VALUES (?,?,?,?,?)')
      .run(sha256(token), app.id, 'verify_email', new Date(Date.parse(now) + ttl).toISOString(), now);
    const e = verificationEmail({ publisherIdentity: this.cfg.publisherIdentity, siteUrl: this.cfg.siteUrl, fullName: app.fullName, verifyUrl: `${this.cfg.siteUrl.replace(/\/$/, '')}/verify?token=${token}` });
    try {
      await this.mailer.send({ to: app.email, from: this.cfg.fromAddress, replyTo: this.cfg.replyTo, subject: e.subject, html: e.html, text: e.text, headers: {}, idempotencyKey: `verify:${sha256(token).slice(0, 32)}` });
      this.repo.audit('access', 'verification.sent', app.id);
    } catch (err) {
      this.repo.audit('access', 'alert', app.id, { message: 'verification email failed', error: String(err) });
    }
  }

  /** Single-use, expiring token. Invalid, expired or reused tokens change nothing. */
  verifyEmail(token: string): { ok: boolean; message: string } {
    const fail = { ok: false, message: 'This confirmation link is invalid or has expired. Submit the request again to receive a new link.' };
    if (!token || token.length > 200) return fail;
    return this.repo.transaction(() => {
      const row = this.db.prepare('SELECT * FROM verification_tokens WHERE token_sha256 = ?').get(sha256(token)) as Record<string, string> | undefined;
      if (!row || row.used_at || Date.parse(row.expires_at) < Date.parse(this.repo.now())) return fail;
      const app = this.getApplication(row.application_id);
      if (!app) return fail;
      this.db.prepare('UPDATE verification_tokens SET used_at = ? WHERE token_sha256 = ?').run(this.repo.now(), row.token_sha256);
      if (app.status === 'applied') {
        this.setStatus(app.id, 'email_verified', 'applicant', { email_verified_at: this.repo.now() });
        this.setStatus(app.id, 'pending_review', 'access');
      }
      return { ok: true, message: 'Thank you — your email is confirmed. Your request is now with the editors for review. We will write to you if it is approved.' };
    });
  }

  // ------------------------------------------------------------ step 4–5: private review

  /**
   * Approve: transactionally assigns a founding seat (the database refuses a
   * 501st), creates or reactivates the subscriber with the consent captured on
   * the application, then sends the welcome email.
   */
  async approve(applicationId: string, reviewer: string, note?: string): Promise<{ subscriberId: string; seat: number }> {
    if (!reviewer.trim()) throw new AccessError('reviewer identity is required');
    const result = this.repo.transaction(() => {
      const app = this.getApplication(applicationId);
      if (!app) throw new AccessError('application not found');
      if (app.status !== 'pending_review' && app.status !== 'waitlisted') throw new AccessError(`application is ${app.status}; only verified, pending applications can be approved`);
      if (!app.emailVerifiedAt) throw new AccessError('email not verified');
      const seats = this.foundingSeatsTaken();
      if (seats >= FOUNDING.maxSeats) throw new FoundingCohortFullError(`the founding cohort is full (${FOUNDING.maxSeats}); waitlist instead`);
      const now = this.repo.now();
      const existingSub = this.db.prepare('SELECT id, status FROM subscribers WHERE email_normalized = ?').get(app.emailNormalized) as { id: string; status: string } | undefined;
      let subscriberId: string;
      if (existingSub) {
        // Re-approval of a former reader uses the consent just given on this application.
        subscriberId = existingSub.id;
        this.db
          .prepare(`UPDATE subscribers SET status = 'subscribed', consent_text_version = ?, consent_at = ?, email_verified_at = ?, founding_cohort = 1, updated_at = ? WHERE id = ?`)
          .run(app.consentTextVersion, app.consentAt, app.emailVerifiedAt, now, subscriberId);
        this.db.prepare('DELETE FROM suppressions WHERE email_normalized = ?').run(app.emailNormalized);
      } else {
        subscriberId = this.repo.addSubscriber({
          email: app.email,
          publicationId: '01-ai-economy',
          status: 'subscribed',
          consentTextVersion: app.consentTextVersion,
          consentAt: app.consentAt,
          emailVerifiedAt: app.emailVerifiedAt ?? undefined,
        }).id;
        this.db.prepare('UPDATE subscribers SET founding_cohort = 1 WHERE id = ?').run(subscriberId);
      }
      const seat = seats + 1;
      this.db.prepare('INSERT INTO founding_seats (seat, subscriber_id, application_id, entitlement, granted_at) VALUES (?,?,?,?,?)').run(seat, subscriberId, app.id, FOUNDING.entitlement, now);
      this.setStatus(app.id, 'approved', reviewer, { reviewer, review_date: now, review_note: note ?? null, subscriber_id: subscriberId });
      return { subscriberId, seat, app };
    });
    await this.sendWelcome(result.subscriberId, result.app.fullName);
    return { subscriberId: result.subscriberId, seat: result.seat };
  }

  async sendWelcome(subscriberId: string, fullName?: string): Promise<void> {
    const sub = this.repo.getSubscriber(subscriberId);
    if (!sub) throw new AccessError('subscriber not found');
    const name = fullName ?? (this.db.prepare('SELECT full_name FROM applications WHERE subscriber_id = ?').get(subscriberId) as { full_name?: string } | undefined)?.full_name ?? '';
    const e = welcomeEmail({
      publisherIdentity: this.cfg.publisherIdentity,
      siteUrl: this.cfg.siteUrl,
      fullName: name,
      specimenUrl: `${this.cfg.siteUrl.replace(/\/$/, '')}/brief`,
      unsubscribeUrl: unsubscribeUrl(this.cfg.siteUrl, sub.id, sub.publicationId, this.cfg.unsubscribeSecret),
    });
    try {
      const r = await this.mailer.send({
        to: sub.email,
        from: this.cfg.fromAddress,
        replyTo: this.cfg.replyTo,
        subject: e.subject,
        html: e.html,
        text: e.text,
        headers: { 'List-Unsubscribe': `<${unsubscribeUrl(this.cfg.siteUrl, sub.id, sub.publicationId, this.cfg.unsubscribeSecret)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
        idempotencyKey: `welcome:${sub.id}`,
      });
      this.repo.audit('access', 'welcome.sent', sub.id, { providerMessageId: r.providerMessageId });
    } catch (err) {
      this.repo.audit('access', 'alert', sub.id, { message: 'welcome email failed; resend with applications:welcome', error: String(err) });
    }
  }

  decline(applicationId: string, reviewer: string, note?: string): void {
    const app = this.getApplication(applicationId);
    if (!app) throw new AccessError('application not found');
    if (!['pending_review', 'waitlisted', 'applied'].includes(app.status)) throw new AccessError(`application is ${app.status}`);
    this.setStatus(app.id, 'declined', reviewer, { reviewer, review_date: this.repo.now(), review_note: note ?? null });
  }

  waitlist(applicationId: string, reviewer: string, note?: string): void {
    const app = this.getApplication(applicationId);
    if (!app) throw new AccessError('application not found');
    if (app.status !== 'pending_review') throw new AccessError(`application is ${app.status}`);
    this.setStatus(app.id, 'waitlisted', reviewer, { reviewer, review_date: this.repo.now(), review_note: note ?? null });
  }

  /** Applicant access/deletion path: removes the application and any unused tokens (subscribers are handled by unsubscribe/suppression). */
  deleteApplication(applicationId: string, actor: string): void {
    this.repo.transaction(() => {
      const app = this.getApplication(applicationId);
      if (!app) throw new AccessError('application not found');
      if (app.status === 'approved') throw new AccessError('approved applications are linked to a subscriber; unsubscribe and suppress instead');
      this.db.prepare('DELETE FROM verification_tokens WHERE application_id = ?').run(app.id);
      this.db.prepare('DELETE FROM applications WHERE id = ?').run(app.id);
      this.repo.audit(actor, 'application.deleted', app.id);
    });
  }
}

/** Fixed-window in-memory limiter (single instance). Keys are hashed; no raw IPs are kept. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private limit: number,
    private windowMs: number,
  ) {}
  allow(key: string, now = Date.now()): boolean {
    const k = sha256(key).slice(0, 24);
    const recent = (this.hits.get(k) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(k, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(k, recent);
    if (this.hits.size > 50_000) this.hits.clear();
    return true;
  }
}
