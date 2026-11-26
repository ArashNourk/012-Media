import { createHmac } from 'node:crypto';
import { hashJson, sha256, type IssueContent } from '../contracts';
import type { Mailer } from '../connectors/mail/mailer';
import type { ObjectStore } from '../connectors/storage/objectStore';
import type { IssueRecord, Repository } from '../persistence/repository';
import { inspectPdf, renderPdf } from './pdf';
import { renderEmail, renderIssueHtml } from './render';
import { formatLocalDate, isPublicationDay, sendGate } from './schedule';
import { unsubscribeUrl } from './unsubscribe';

export interface PublishingConfig {
  siteUrl: string; // public site, e.g. https://zeroonetwo.media
  editionBaseUrl: string; // where unlisted HTML/PDF editions are served from
  publisherIdentity: string; // "012 MEDIA · <postal address>" (CASL sender identification)
  fromAddress: string; // e.g. "012 MEDIA <brief@zeroonetwo.media>"
  replyTo?: string;
  unsubscribeSecret: string;
  unlistedUrlSecret: string;
  testRecipientsOnly: boolean; // dry runs: deliver only to subscribers flagged is_test
}

export type PdfRenderer = (html: string, meta: { title: string }) => Promise<Uint8Array>;

export class PublishingError extends Error {}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): PublishingConfig {
  const need = (k: string) => {
    const v = env[k];
    if (!v) throw new PublishingError(`${k} is not configured`);
    return v;
  };
  return {
    siteUrl: env.SITE_URL ?? 'https://zeroonetwo.media',
    editionBaseUrl: env.EDITION_BASE_URL ?? 'https://zeroonetwo.media/e',
    publisherIdentity: need('PUBLISHER_IDENTITY'),
    fromAddress: need('MAIL_FROM'),
    replyTo: env.MAIL_REPLY_TO,
    unsubscribeSecret: need('UNSUBSCRIBE_SECRET'),
    unlistedUrlSecret: need('UNLISTED_URL_SECRET'),
    testRecipientsOnly: env.TEST_RECIPIENTS_ONLY !== 'false',
  };
}

/**
 * 012 Publishing Engine — output only. Consumes approved, immutable issue
 * snapshots; renders HTML email, plain text, hosted HTML and PDF from the
 * same record; dispatches exactly once per local issue date.
 */
export class PublishingEngine {
  constructor(
    private repo: Repository,
    private store: ObjectStore,
    private mailer: Mailer,
    private cfg: PublishingConfig,
    private pdf: PdfRenderer = renderPdf,
  ) {}

  private editionPath(c: IssueContent, sha: string): string {
    const token = createHmac('sha256', this.cfg.unlistedUrlSecret).update(`${c.issueId}:${sha}`).digest('hex').slice(0, 24);
    return `editions/${c.publicationId}/${c.localIssueDate}/${token}`;
  }

  /** Editor preview of the current draft (clearly marked, never distributed). */
  async renderPreview(issueId: string): Promise<{ htmlKey: string; pdfKey: string; pdfInfo: ReturnType<typeof inspectPdf> }> {
    const issue = this.repo.getIssue(issueId);
    if (!issue.content) throw new PublishingError('issue has no draft content');
    const html = renderIssueHtml(issue.content, { mode: 'preview', publisherIdentity: this.cfg.publisherIdentity, siteUrl: this.cfg.siteUrl });
    const pdf = await this.pdf(html, { title: `012 MEDIA — ${issue.content.publicationLabel} — PREVIEW` });
    const base = `review/${issueId}/v${issue.content.version}`;
    await this.store.put(`${base}/preview.html`, html, 'text/html');
    await this.store.put(`${base}/preview.pdf`, pdf, 'application/pdf');
    return { htmlKey: `${base}/preview.html`, pdfKey: `${base}/preview.pdf`, pdfInfo: inspectPdf(pdf) };
  }

  /** Render the approved snapshot. Verifies the snapshot hash first; any failure → FAILED_RENDER, never a send. */
  async renderApproved(issueId: string): Promise<IssueRecord> {
    const issue = this.repo.getIssue(issueId);
    if (issue.state !== 'EDITOR_APPROVED' && issue.state !== 'FAILED_RENDER') throw new PublishingError(`cannot render issue in state ${issue.state}`);
    const c = issue.approvedContent;
    if (!c || !issue.approvedSha256 || hashJson(c) !== issue.approvedSha256) {
      this.repo.transitionIssue(issueId, 'FAILED_RENDER', 'publishing', 'approved snapshot missing or hash mismatch');
      throw new PublishingError('approved snapshot missing or does not match its approval hash');
    }
    try {
      const base = this.editionPath(c, issue.approvedSha256);
      const html = renderIssueHtml(c, { mode: 'approved', approvedSha256: issue.approvedSha256, approvedAt: issue.approvedAt ?? undefined, publisherIdentity: this.cfg.publisherIdentity, siteUrl: this.cfg.siteUrl });
      const title = `012 MEDIA — ${c.publicationLabel} — ${formatLocalDate(c.localIssueDate)}`;
      const pdf = await this.pdf(html, { title });
      const info = inspectPdf(pdf);
      const missingLinks = c.sources.map((s) => s.url).filter((u) => !info.linkUris.includes(u));
      if (!info.hasFonts || info.pages < 1 || missingLinks.length) throw new PublishingError(`PDF validation failed: fonts=${info.hasFonts} pages=${info.pages} missingLinks=${missingLinks.join(', ')}`);
      const slug = `012-ai-economy-${c.localIssueDate}`;
      await this.store.put(`${base}/index.html`, html, 'text/html');
      await this.store.put(`${base}/${slug}.pdf`, pdf, 'application/pdf');
      const sample = renderEmail(c, this.emailLinks(c, issue.approvedSha256, 'SUBSCRIBER'));
      this.repo.setRenderedKeys(issueId, { htmlKey: `${base}/index.html`, pdfKey: `${base}/${slug}.pdf`, emailPayloadSha256: sha256(sample.html) });
      this.repo.audit('publishing', 'render.completed', issueId, { pages: info.pages, links: info.linkUris.length, tagged: info.isTagged });
      return this.repo.transitionIssue(issueId, 'RENDERED', 'publishing', `${info.pages} page PDF, ${info.linkUris.length} active links`);
    } catch (e) {
      this.repo.transitionIssue(issueId, 'FAILED_RENDER', 'publishing', e instanceof Error ? e.message : String(e));
      throw e;
    }
  }

  private emailLinks(c: IssueContent, sha: string, subscriberId: string) {
    const base = `${this.cfg.editionBaseUrl.replace(/\/$/, '')}/${this.editionPath(c, sha).replace(/^editions\//, '')}`;
    return {
      briefUrl: `${base}/`,
      pdfUrl: `${base}/012-ai-economy-${c.localIssueDate}.pdf`,
      unsubscribeUrl: unsubscribeUrl(this.cfg.siteUrl, subscriberId, c.publicationId, this.cfg.unsubscribeSecret),
      publisherIdentity: this.cfg.publisherIdentity,
      siteUrl: this.cfg.siteUrl,
    };
  }

  /** Send preflight → SEND_READY. */
  prepareSend(issueId: string): { issue: IssueRecord; checks: { id: string; passed: boolean; detail: string }[] } {
    const issue = this.repo.getIssue(issueId);
    const checks: { id: string; passed: boolean; detail: string }[] = [];
    const c = issue.approvedContent;
    checks.push({ id: 'state_rendered', passed: issue.state === 'RENDERED', detail: issue.state });
    checks.push({ id: 'approved_hash', passed: !!c && hashJson(c) === issue.approvedSha256, detail: issue.approvedSha256 ?? 'none' });
    checks.push({ id: 'rendered_artifacts', passed: !!issue.pdfKey && !!issue.htmlKey, detail: `${issue.htmlKey} | ${issue.pdfKey}` });
    checks.push({ id: 'publication_day', passed: isPublicationDay(issue.localIssueDate), detail: issue.localIssueDate });
    const prior = this.repo.getDispatchByDate(issue.publicationId, issue.localIssueDate);
    checks.push({ id: 'not_already_sent', passed: !prior || (prior.status !== 'complete'), detail: prior ? `dispatch ${String(prior.id)} ${String(prior.status)}` : 'no prior dispatch' });
    const recipients = this.repo.listEligibleRecipients(issue.publicationId, { testOnly: this.cfg.testRecipientsOnly });
    checks.push({ id: 'approved_recipients', passed: recipients.length > 0, detail: `${recipients.length} eligible (approved, consented, verified, not suppressed${this.cfg.testRecipientsOnly ? ', test-flagged only' : ''})` });
    checks.push({ id: 'sender_identification', passed: /\S+@\S+/.test(this.cfg.fromAddress) && this.cfg.publisherIdentity.length > 10, detail: this.cfg.publisherIdentity });
    checks.push({ id: 'unsubscribe_configured', passed: this.cfg.unsubscribeSecret.length >= 16, detail: 'signed one-click unsubscribe links' });
    const failed = checks.filter((x) => !x.passed);
    this.repo.audit('publishing', 'send_preflight', issueId, checks);
    if (failed.length) return { issue, checks };
    return { issue: this.repo.transitionIssue(issueId, 'SEND_READY', 'publishing', 'send preflight passed'), checks };
  }

  /**
   * Exactly-once dispatch for the issue's local date. Safe to call repeatedly
   * (cron at both possible UTC slots, retries, crashes): the unique dispatch
   * row and per-recipient idempotency keys prevent duplicates, and a partial
   * batch resumes without resending successful recipients.
   */
  async dispatch(issueId: string, opts: { now: Date; simulatedClock?: boolean }): Promise<{ status: 'sent' | 'partial' | 'already_sent' | 'not_due' | 'not_ready'; detail: string }> {
    if (opts.simulatedClock && !this.mailer.sandbox) throw new PublishingError('a simulated clock may only be used with the sandbox mailer');
    const issue = this.repo.getIssue(issueId);
    const gate = sendGate(opts.now);
    if (!gate.open) return { status: 'not_due', detail: `send gate closed (${gate.reason}, Toronto ${gate.localDate})` };
    if (gate.localDate !== issue.localIssueDate) return { status: 'not_due', detail: `issue date ${issue.localIssueDate} ≠ Toronto date ${gate.localDate}` };
    if (issue.state === 'SENT') return { status: 'already_sent', detail: `sent at ${issue.sentAt}` };
    if (issue.state !== 'SEND_READY' && issue.state !== 'FAILED_DELIVERY') return { status: 'not_ready', detail: `issue state ${issue.state}` };
    const c = issue.approvedContent!;
    if (hashJson(c) !== issue.approvedSha256) throw new PublishingError('approved snapshot hash mismatch at dispatch');

    const { row, created } = this.repo.claimDispatch({ issueId, publicationId: issue.publicationId, localIssueDate: issue.localIssueDate, approvedSha256: issue.approvedSha256!, mailer: this.mailer.id });
    if (String(row.issue_id) !== issueId) return { status: 'already_sent', detail: `another issue (${String(row.issue_id)}) was dispatched for ${issue.localIssueDate}` };
    if (!created && row.status === 'complete') return { status: 'already_sent', detail: `dispatch ${String(row.id)} complete` };
    const dispatchId = String(row.id);
    const recipients = this.repo.listEligibleRecipients(issue.publicationId, { testOnly: this.cfg.testRecipientsOnly });
    const eligible = new Set(recipients.map((r) => r.id));

    // Recipients who became ineligible (e.g. unsubscribed) between batches are skipped.
    for (const d of this.repo.listDeliveries(dispatchId)) if (d.status === 'pending' && !eligible.has(String(d.subscriber_id))) this.repo.updateDelivery(String(d.id), 'skipped', { error: 'no longer eligible' });

    let failures = 0;
    for (const r of recipients) {
      const key = `${issue.publicationId}:${issue.localIssueDate}:${r.id}`;
      const d = this.repo.ensureDelivery(dispatchId, r.id, key);
      if (d.status === 'sent') continue;
      const e = renderEmail(c, this.emailLinks(c, issue.approvedSha256!, r.id));
      const links = this.emailLinks(c, issue.approvedSha256!, r.id);
      try {
        const res = await this.mailer.send({
          to: r.email,
          from: this.cfg.fromAddress,
          replyTo: this.cfg.replyTo,
          subject: e.subject,
          html: e.html,
          text: e.text,
          headers: { 'List-Unsubscribe': `<${links.unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click', 'X-012-Issue': issue.id },
          idempotencyKey: key,
        });
        this.repo.updateDelivery(String(d.id), 'sent', { providerMessageId: res.providerMessageId });
      } catch (err) {
        failures++;
        this.repo.updateDelivery(String(d.id), 'failed', { error: err instanceof Error ? err.message : String(err) });
      }
    }
    if (failures) {
      this.repo.setDispatchStatus(dispatchId, 'partial');
      if (issue.state !== 'FAILED_DELIVERY') this.repo.transitionIssue(issueId, 'FAILED_DELIVERY', 'publishing', `${failures} delivery failure(s); resumable`);
      else this.repo.audit('publishing', 'dispatch.partial', issueId, { failures });
      return { status: 'partial', detail: `${failures} failed of ${recipients.length}; rerun to resume` };
    }
    this.repo.setDispatchStatus(dispatchId, 'complete');
    this.repo.markSent(issueId);
    this.repo.transitionIssue(issueId, 'SENT', 'publishing', `${recipients.length} recipient(s) via ${this.mailer.id}`);
    return { status: 'sent', detail: `${recipients.length} recipient(s) via ${this.mailer.id}` };
  }
}
