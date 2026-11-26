import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface OutgoingEmail {
  to: string;
  from: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
  idempotencyKey: string;
}

export interface Mailer {
  readonly id: string;
  /** Sandbox mailers never reach real inboxes; only they may run under a simulated clock. */
  readonly sandbox: boolean;
  send(msg: OutgoingEmail): Promise<{ providerMessageId: string }>;
}

/**
 * Sandbox outbox: writes each message to disk keyed by its idempotency key.
 * Re-sending the same key returns the original message id without writing a
 * second copy, mirroring provider-side idempotency.
 */
export class OutboxMailer implements Mailer {
  readonly id = 'outbox';
  readonly sandbox = true;
  failNext = 0; // test hook: number of upcoming sends that fail
  constructor(private dir: string) {}

  async send(msg: OutgoingEmail) {
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error('simulated provider failure');
    }
    mkdirSync(this.dir, { recursive: true });
    const safe = msg.idempotencyKey.replace(/[^A-Za-z0-9._-]/g, '_');
    const metaPath = join(this.dir, `${safe}.json`);
    if (existsSync(metaPath)) return { providerMessageId: (JSON.parse(readFileSync(metaPath, 'utf8')) as { id: string }).id };
    const id = `outbox-${safe}`;
    writeFileSync(join(this.dir, `${safe}.html`), msg.html);
    writeFileSync(join(this.dir, `${safe}.txt`), msg.text);
    writeFileSync(metaPath, JSON.stringify({ id, to: msg.to, from: msg.from, subject: msg.subject, headers: msg.headers, idempotencyKey: msg.idempotencyKey }, null, 2));
    return { providerMessageId: id };
  }

  count(): number {
    if (!existsSync(this.dir)) return 0;
    return readdirSync(this.dir).filter((f) => f.endsWith('.json')).length;
  }
}

/**
 * Resend transactional adapter (https://resend.com/docs/api-reference/emails/send-email).
 * Uses the provider's Idempotency-Key header so a retried request for the
 * same subscriber/issue cannot produce a second message. Not exercised
 * against the live API in this repository — requires RESEND_API_KEY and a
 * verified sending domain (SPF/DKIM/DMARC).
 */
export class ResendMailer implements Mailer {
  readonly id = 'resend';
  readonly sandbox = false;
  constructor(private apiKey: string = process.env.RESEND_API_KEY ?? '') {
    if (!this.apiKey) throw new Error('RESEND_API_KEY is not configured');
  }

  async send(msg: OutgoingEmail) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json', 'idempotency-key': msg.idempotencyKey },
      body: JSON.stringify({
        from: msg.from,
        to: [msg.to],
        reply_to: msg.replyTo,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        headers: msg.headers,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !body.id) throw new Error(`resend ${res.status}: ${body.message ?? 'unknown error'}`);
    return { providerMessageId: body.id };
  }
}
