import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { prepareEdition } from '../packages/orchestrator/prepareEdition';
import { tick } from '../packages/publishing/scheduler';
import { sendGate, torontoParts } from '../packages/publishing/schedule';
import { handleUnsubscribe, unsubscribeToken } from '../packages/publishing/unsubscribe';
import { PublishingEngine, PublishingError } from '../packages/publishing/engine';
import { ResendMailer } from '../packages/connectors/mail/mailer';
import { approveIssue } from '../packages/review/approval';
import { makeWorld, testPublishingConfig } from './helpers';
import { fixturePages, scripts } from './fixtures';
import { renderPdf, inspectPdf } from '../packages/publishing/pdf';

const count = (dir: string) => readdirSync(dir).filter((f) => f.endsWith('.json')).length;
const SECRET = 'test-unsubscribe-secret-0123456789';

async function approvedWorld(o: { localIssueDate: string; asOf: string; now?: string; pdf?: any; shiftDays?: number } = { localIssueDate: '2026-11-26', asOf: '2026-11-25T22:00:00.000Z' }) {
  const w = makeWorld({ pages: fixturePages({}, o.shiftDays ?? 0), scripts: scripts(), now: o.now ?? '2026-11-25T22:00:00Z', pdf: o.pdf });
  const subs = ['a@example.test', 'b@example.test', 'c@example.test'].map((email) =>
    w.repo.addSubscriber({ email, publicationId: '01-ai-economy', status: 'subscribed', consentTextVersion: 'v1', consentAt: w.repo.now(), emailVerifiedAt: w.repo.now() }),
  );
  const r = await prepareEdition(w.ctx, w.publishing, { localIssueDate: o.localIssueDate, asOf: o.asOf, lookbackHours: 72 });
  if (r.status !== 'drafted') throw new Error(`prepare: ${r.status} ${'reason' in r ? r.reason : ''}`);
  if (r.preflight.blocking) throw new Error(JSON.stringify(r.preflight.checks.filter((c) => !c.passed)));
  await approveIssue(w.repo, w.store, { issueId: r.issue.id, editor: 'Test Editor' });
  return { w, issueId: r.issue.id, subs };
}

describe('Toronto scheduling (DST-safe)', () => {
  it('maps 09:00 Toronto to 14:00 UTC in EST and 13:00 UTC in EDT without a fixed offset', () => {
    expect(torontoParts(new Date('2026-11-26T14:00:00Z'))).toMatchObject({ localDate: '2026-11-26', hour: 9, offset: 'GMT-05:00' });
    expect(torontoParts(new Date('2026-06-15T13:00:00Z'))).toMatchObject({ localDate: '2026-06-15', hour: 9, offset: 'GMT-04:00' });
    expect(sendGate(new Date('2026-06-15T12:59:00Z')).open).toBe(false);
    expect(sendGate(new Date('2026-11-28T15:00:00Z'))).toMatchObject({ open: false, reason: 'weekend' });
  });

  it('two cron triggers across the November DST boundary send once per local date', async () => {
    // Monday 2 Nov 2026 is the first weekday after DST ends (1 Nov). Triggers at 13:00 and 14:00 UTC.
    const { w, issueId } = await approvedWorld({ localIssueDate: '2026-11-02', asOf: '2026-11-01T22:00:00.000Z', now: '2026-11-01T22:00:00Z', shiftDays: 24 });
    const first = await tick(w.repo, w.publishing, new Date('2026-11-02T13:00:00Z')); // 08:00 EST
    expect(first.action).toBe('none');
    const second = await tick(w.repo, w.publishing, new Date('2026-11-02T14:00:00Z')); // 09:00 EST
    expect(second.action).toBe('sent');
    expect(count(w.outDir)).toBe(3);
    expect(w.repo.getIssue(issueId).state).toBe('SENT');
  });

  it('two cron triggers in EDT (March, after DST starts) send once', async () => {
    const { w } = await approvedWorld({ localIssueDate: '2026-03-09', asOf: '2026-03-08T22:00:00.000Z', now: '2026-03-08T22:00:00Z', shiftDays: 262 });
    expect((await tick(w.repo, w.publishing, new Date('2026-03-09T13:00:00Z'))).action).toBe('sent'); // 09:00 EDT
    expect((await tick(w.repo, w.publishing, new Date('2026-03-09T14:00:00Z'))).action).toBe('already_sent');
    expect(count(w.outDir)).toBe(3);
  });
});

describe('012 Publishing Engine — delivery safety', () => {
  it('resumes a partial provider batch without duplicate messages', async () => {
    const { w, issueId } = await approvedWorld();
    // render + send-ready, then fail the second message
    await w.publishing.renderApproved(issueId);
    w.publishing.prepareSend(issueId);
    let calls = 0;
    const orig = w.mailer.send.bind(w.mailer);
    w.mailer.send = async (m) => {
      calls++;
      if (calls === 2) throw new Error('provider 503');
      return orig(m);
    };
    const r1 = await w.publishing.dispatch(issueId, { now: new Date('2026-11-26T14:00:00Z') });
    expect(r1.status).toBe('partial');
    expect(w.repo.getIssue(issueId).state).toBe('FAILED_DELIVERY');
    expect(count(w.outDir)).toBe(2);
    const r2 = await w.publishing.dispatch(issueId, { now: new Date('2026-11-26T14:10:00Z') });
    expect(r2.status).toBe('sent');
    expect(count(w.outDir)).toBe(3);
    expect(calls).toBe(4); // 3 first pass + only the failed one retried
    const d = w.repo.listDeliveries(String(w.repo.getDispatchByIssue(issueId)!.id));
    expect(d.every((x) => x.status === 'sent')).toBe(true);
  });

  it('an unsubscribed reader never receives an edition (one-click token)', async () => {
    const { w, subs } = await approvedWorld();
    const res = handleUnsubscribe(w.repo, unsubscribeToken(subs[0].id, '01-ai-economy', SECRET), SECRET);
    expect(res.ok).toBe(true);
    await tick(w.repo, w.publishing, new Date('2026-11-26T14:00:00Z'));
    const files = readdirSync(w.outDir).filter((f) => f.endsWith('.json'));
    expect(files).toHaveLength(2);
    expect(files.some((f) => f.includes(subs[0].id))).toBe(false);
  });

  it('an invalid or tampered unsubscribe token changes nothing', async () => {
    const { w, subs } = await approvedWorld();
    const good = unsubscribeToken(subs[1].id, '01-ai-economy', SECRET);
    const tampered = `${good.split('.')[0]}.AAAA${good.split('.')[1].slice(4)}`;
    expect(handleUnsubscribe(w.repo, tampered, SECRET).ok).toBe(false);
    expect(handleUnsubscribe(w.repo, unsubscribeToken(subs[1].id, '01-ai-economy', 'another-secret-entirely-xx'), SECRET).ok).toBe(false);
    expect(w.repo.getSubscriber(subs[1].id)!.status).toBe('subscribed');
  });

  it('a failed PDF generation blocks the issue (no send)', async () => {
    let fail = false;
    const flaky = async (html: string) => {
      if (fail) throw new Error('renderer crashed');
      const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => `/URI (${m[1]})`).join('\n');
      return new TextEncoder().encode(`%PDF-1.7\n/Type /Page \n/Font /F1\n${links}`);
    };
    const { w, issueId } = await approvedWorld({ localIssueDate: '2026-11-26', asOf: '2026-11-25T22:00:00.000Z', pdf: flaky });
    fail = true;
    const r = await tick(w.repo, w.publishing, new Date('2026-11-26T14:00:00Z'));
    expect(r.action).toBe('failed');
    expect(w.repo.getIssue(issueId).state).toBe('FAILED_RENDER');
    expect(count(w.outDir)).toBe(0);
  });

  it('changing an issue after approval voids the approval and requires reapproval', async () => {
    const { w, issueId } = await approvedWorld();
    const issue = w.repo.getIssue(issueId);
    w.repo.setIssueContent(issueId, { ...issue.content!, headline: 'Edited after approval' }, 'editor');
    const after = w.repo.getIssue(issueId);
    expect(after.state).toBe('DRAFTED');
    expect(after.approvedSha256).toBeNull();
    const r = await tick(w.repo, w.publishing, new Date('2026-11-26T14:00:00Z'));
    expect(r.action).toBe('held');
    expect(count(w.outDir)).toBe(0);
  });

  it('refuses to approve an issue whose preflight blocks (e.g. model-produced citation never retrieved)', async () => {
    const w = makeWorld({ pages: fixturePages(), scripts: scripts({ 'editorial.compose': () => ({ headline: 'A headline', lead: 'See https://invented.example.test/news/not-retrieved for details.' }) }) });
    const r = await prepareEdition(w.ctx, w.publishing, { localIssueDate: '2026-11-26', asOf: '2026-11-25T22:00:00.000Z' });
    if (r.status !== 'drafted') throw new Error(r.status);
    expect(r.preflight.checks.find((c) => c.id === 'no_unretrieved_citations')!.passed).toBe(false);
    await expect(approveIssue(w.repo, w.store, { issueId: r.issue.id, editor: 'Test Editor' })).rejects.toThrow(/no_unretrieved_citations/);
  });

  it('never sends with a simulated clock through a real provider, and cannot construct one without credentials', async () => {
    const { w, issueId } = await approvedWorld();
    const fakeReal = { id: 'resend', sandbox: false, send: async () => ({ providerMessageId: 'x' }) };
    const eng = new PublishingEngine(w.repo, w.store, fakeReal, testPublishingConfig(), async () => new Uint8Array());
    await expect(eng.dispatch(issueId, { now: new Date('2026-11-26T14:00:00Z'), simulatedClock: true })).rejects.toBeInstanceOf(PublishingError);
    const prev = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    expect(() => new ResendMailer()).toThrow(/RESEND_API_KEY/);
    if (prev) process.env.RESEND_API_KEY = prev;
  });

  it('renders a real, text-selectable PDF with active citation links (Chromium)', async () => {
    const { w, issueId } = await approvedWorld({ localIssueDate: '2026-11-26', asOf: '2026-11-25T22:00:00.000Z', pdf: renderPdf });
    const rendered = await w.publishing.renderApproved(issueId);
    expect(rendered.state).toBe('RENDERED');
    const bytes = (await w.store.get(rendered.pdfKey!))!;
    const info = inspectPdf(bytes);
    expect(info.hasFonts).toBe(true);
    expect(info.pages).toBeGreaterThanOrEqual(1);
    for (const s of rendered.approvedContent!.sources) expect(info.linkUris).toContain(s.url);
  });
});
