import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { seedPosition } from '../packages/intelligence/continuity/seed';
import { prepareEdition } from '../packages/orchestrator/prepareEdition';
import { tick } from '../packages/publishing/scheduler';
import { approveIssue, ApprovalError } from '../packages/review/approval';
import { makeWorld } from './helpers';
import { SEED, fixturePages, scripts } from './fixtures';

const outboxCount = (dir: string) => readdirSync(dir).filter((f) => f.endsWith('.json')).length;

async function preparedWorld() {
  const w = makeWorld({ pages: fixturePages(), scripts: scripts() });
  const seeded = await seedPosition(w.ctx, SEED);
  if ('pending' in seeded) throw new Error('unexpected pending');
  const ok = w.repo.addSubscriber({ email: 'Reader@Example.test', publicationId: '01-ai-economy', status: 'subscribed', consentTextVersion: 'v1', consentAt: w.repo.now(), emailVerifiedAt: w.repo.now() });
  const gone = w.repo.addSubscriber({ email: 'left@example.test', publicationId: '01-ai-economy', status: 'subscribed', consentTextVersion: 'v1', consentAt: w.repo.now(), emailVerifiedAt: w.repo.now() });
  w.repo.setSubscriberStatus(gone.id, 'unsubscribed', 'test');
  w.repo.addSubscriber({ email: 'unverified@example.test', publicationId: '01-ai-economy', status: 'approved', consentTextVersion: 'v1', consentAt: w.repo.now() });
  const r = await prepareEdition(w.ctx, w.publishing, { localIssueDate: '2026-11-26', asOf: '2026-11-25T22:00:00.000Z' });
  return { w, r, seeded, ok };
}

describe('end-to-end: 012 Intelligence Engine → Continuity Ledger → editorial approval → 012 Publishing Engine', () => {
  it('produces a connected, gated draft with a continuity proposal against the seeded position', async () => {
    const { w, r, seeded } = await preparedWorld();
    expect(r.status).toBe('drafted');
    if (r.status !== 'drafted') return;
    expect(r.preflight.checks.filter((c) => !c.passed && c.severity === 'block')).toEqual([]);
    const c = r.issue.content!;
    expect(r.issue.state).toBe('DRAFTED');
    expect(c.signals).toHaveLength(3);
    expect(c.signals.some((s) => s.weakSignal)).toBe(true);
    expect(c.consequences).toHaveLength(1);
    expect(c.position?.decision).toBe('MONITOR'); // PURSUE downgraded: demand unknown, critique "revise"
    expect(c.position?.positionId).toBe('POS-000002');
    expect(c.continuity).toHaveLength(1);
    expect(c.continuity[0]).toMatchObject({ positionId: seeded.position.id, previousStatus: 'EMERGING', newStatus: 'STRENGTHENING' });
    expect(c.continuity[0].originalReference).toMatch(/Seeded ledger record/);
    // every link in the issue is a retrieved article
    for (const s of c.sources) expect(w.repo.getSource(s.sourceId)!.retrievalStatus).toBe('ok');
    // the position is not yet in the ledger (unpublished); the original thesis is still editable
    expect(w.repo.getPosition('POS-000002')!.published).toBe(false);
  });

  it('fails closed without approval, then sends exactly once after approval across repeated triggers', async () => {
    const { w, r } = await preparedWorld();
    if (r.status !== 'drafted') throw new Error(r.status);
    const issueId = r.issue.id;

    // 08:00 EST — before send time
    expect((await tick(w.repo, w.publishing, new Date('2026-11-26T13:00:00Z'))).action).toBe('none');
    // 09:00 EST — no approval → hold + alert, nothing sent
    const held = await tick(w.repo, w.publishing, new Date('2026-11-26T14:00:00Z'));
    expect(held.action).toBe('held');
    expect(w.repo.getIssue(issueId).state).toBe('HELD_FOR_APPROVAL');
    expect(outboxCount(w.outDir)).toBe(0);

    // wrong hash → approval refused
    await expect(approveIssue(w.repo, w.store, { issueId, editor: 'Test Editor', expectedSha256: 'deadbeef' })).rejects.toBeInstanceOf(ApprovalError);
    const a = await approveIssue(w.repo, w.store, { issueId, editor: 'Test Editor', expectedSha256: r.issue.contentSha256!.slice(0, 16) });
    expect(a.issue.state).toBe('EDITOR_APPROVED');
    expect(a.revisions).toHaveLength(1);

    // ledger: revision appended, status changed, new position locked
    const rev = w.repo.listRevisions('POS-000001');
    expect(rev).toHaveLength(1);
    expect(rev[0]).toMatchObject({ previousStatus: 'EMERGING', newStatus: 'STRENGTHENING', editorApprovalId: a.approvalId, issueId });
    expect(w.repo.getPosition('POS-000001')!.currentStatus).toBe('STRENGTHENING');
    expect(w.repo.getPosition('POS-000002')!.published).toBe(true);
    expect(() => w.db.prepare(`UPDATE positions SET original_thesis = 'rewritten' WHERE id = 'POS-000002'`).run()).toThrow(/immutable/);
    expect(() => w.db.prepare(`UPDATE position_revisions SET new_status = 'VALIDATED'`).run()).toThrow(/append-only/);
    expect(() => w.db.prepare(`DELETE FROM position_revisions`).run()).toThrow(/append-only/);

    // 09:05 EST — render, send-preflight, dispatch
    const sent = await tick(w.repo, w.publishing, new Date('2026-11-26T14:05:00Z'));
    expect(sent).toMatchObject({ action: 'sent' });
    expect(w.repo.getIssue(issueId).state).toBe('SENT');
    expect(outboxCount(w.outDir)).toBe(1); // unsubscribed and unverified readers excluded

    // repeated triggers (second UTC slot, retries) never duplicate
    expect((await tick(w.repo, w.publishing, new Date('2026-11-26T15:00:00Z'))).action).toBe('already_sent');
    expect((await tick(w.repo, w.publishing, new Date('2026-11-26T14:06:00Z'))).action).toBe('already_sent');
    expect(outboxCount(w.outDir)).toBe(1);
  });

  it('a subsequent edition reviews continuity against the latest approved revision, not the original only', async () => {
    const { w, r } = await preparedWorld();
    if (r.status !== 'drafted') throw new Error(r.status);
    await approveIssue(w.repo, w.store, { issueId: r.issue.id, editor: 'Test Editor' });
    // next day, no new evidence published after the revision → no new proposal; status change impossible
    w.setNow('2026-11-26T22:00:00Z');
    const next = await prepareEdition(w.ctx, w.publishing, { localIssueDate: '2026-11-27', asOf: '2026-11-26T22:00:00.000Z', lookbackHours: 96 });
    if (next.status !== 'drafted') throw new Error(`${next.status}`);
    expect(next.issue.content!.continuity.filter((c) => c.positionId === 'POS-000001')).toHaveLength(0);
    expect(w.repo.listRevisions('POS-000001')).toHaveLength(1);
  });
});
