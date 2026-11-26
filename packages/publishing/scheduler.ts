import { PUBLICATION_01 } from '../contracts';
import type { Repository } from '../persistence/repository';
import type { PublishingEngine } from './engine';
import { sendGate } from './schedule';

export interface TickResult {
  action: 'none' | 'held' | 'sent' | 'partial' | 'already_sent' | 'failed';
  detail: string;
}

/**
 * Scheduled job body. Configure the platform cron to fire at 13:00 and 14:00
 * UTC on weekdays (09:00 Toronto in EDT and EST respectively); the local-time
 * gate and the unique dispatch per local date make it fire exactly once.
 * Fails closed: without an approved issue nothing is sent, the issue is held
 * and the editor is alerted. No placeholder newsletter is ever generated.
 */
export async function tick(repo: Repository, publishing: PublishingEngine, now: Date, opts: { simulatedClock?: boolean } = {}): Promise<TickResult> {
  const gate = sendGate(now);
  if (!gate.open) return { action: 'none', detail: `send gate closed: ${gate.reason} (Toronto ${gate.localDate})` };
  const issue = repo.getIssueByDate(PUBLICATION_01.id, gate.localDate);
  const alert = (message: string) => {
    repo.audit('scheduler', 'alert', issue?.id, { localDate: gate.localDate, message });
    console.error(`[012 ALERT] ${gate.localDate}: ${message}`);
  };
  if (!issue) {
    alert('no edition prepared for today; nothing sent');
    return { action: 'held', detail: 'no issue for local date' };
  }
  try {
    if (issue.state === 'SENT' || issue.state === 'CORRECTED') return { action: 'already_sent', detail: `issue ${issue.id} already sent` };
    if (issue.state === 'DRAFTED') {
      repo.transitionIssue(issue.id, 'HELD_FOR_APPROVAL', 'scheduler', 'send time reached without editor approval');
      alert(`issue ${issue.id} not approved at send time; held`);
      return { action: 'held', detail: 'awaiting editor approval' };
    }
    if (!['EDITOR_APPROVED', 'FAILED_RENDER', 'RENDERED', 'SEND_READY', 'FAILED_DELIVERY'].includes(issue.state)) {
      alert(`issue ${issue.id} is ${issue.state}; nothing sent`);
      return { action: 'held', detail: `issue state ${issue.state}` };
    }
    if (issue.state === 'EDITOR_APPROVED' || issue.state === 'FAILED_RENDER') await publishing.renderApproved(issue.id);
    if (repo.getIssue(issue.id).state === 'RENDERED') {
      const pre = publishing.prepareSend(issue.id);
      if (pre.issue.state !== 'SEND_READY') {
        alert(`send preflight failed: ${pre.checks.filter((c) => !c.passed).map((c) => `${c.id} (${c.detail})`).join('; ')}`);
        return { action: 'held', detail: 'send preflight failed' };
      }
    }
    const r = await publishing.dispatch(issue.id, { now, simulatedClock: opts.simulatedClock });
    if (r.status === 'partial') alert(`partial delivery: ${r.detail}`);
    return { action: r.status === 'sent' ? 'sent' : r.status === 'partial' ? 'partial' : r.status === 'already_sent' ? 'already_sent' : 'held', detail: r.detail };
  } catch (e) {
    alert(`publishing failed: ${e instanceof Error ? e.message : String(e)}`);
    return { action: 'failed', detail: e instanceof Error ? e.message : String(e) };
  }
}
