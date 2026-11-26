import { PUBLICATION_01 } from '../packages/contracts';
import { prepareEdition } from '../packages/orchestrator/prepareEdition';
import { isPublicationDay, torontoParts } from '../packages/publishing/schedule';
import { tick } from '../packages/publishing/scheduler';
import type { Deps } from './deps';

/**
 * In-process scheduler (one web instance). Every few minutes:
 *  - after RESEARCH_AT (Toronto local, default 05:30) on a weekday, prepare
 *    today's edition once, if ENABLE_RESEARCH=true and no run exists yet;
 *  - call `tick`, whose Toronto-time gate and unique dispatch make sending
 *    exactly-once and fail-closed without editor approval.
 */
export function startScheduler(deps: Deps, env: NodeJS.ProcessEnv): NodeJS.Timeout {
  const everyMs = Number(env.SCHEDULER_INTERVAL_SECONDS ?? 300) * 1000;
  const [rh, rm] = String(env.RESEARCH_AT ?? '05:30').split(':').map(Number);
  let busy = false;
  const loop = async () => {
    if (busy) return;
    busy = true;
    try {
      const now = new Date();
      const p = torontoParts(now);
      if (env.ENABLE_RESEARCH === 'true' && isPublicationDay(p.localDate) && p.hour * 60 + p.minute >= rh * 60 + rm && p.hour < 9) {
        if (!deps.ctx.repo.latestRun(PUBLICATION_01.id, p.localDate)) {
          const r = await prepareEdition(deps.ctx, deps.publishing, { localIssueDate: p.localDate, asOf: now.toISOString(), liveLinkCheck: true });
          console.log(`[012] research ${p.localDate}: ${r.status}`);
        }
      }
      const t = await tick(deps.ctx.repo, deps.publishing, now);
      if (t.action !== 'none') console.log(`[012] tick ${p.localDate} ${p.hour}:${String(p.minute).padStart(2, '0')}: ${t.action} — ${t.detail}`);
    } catch (e) {
      deps.ctx.repo.audit('scheduler', 'alert', undefined, { message: 'scheduler loop failed', error: String(e) });
      console.error('[012 ALERT] scheduler loop failed:', e instanceof Error ? e.message : e);
    } finally {
      busy = false;
    }
  };
  void loop();
  console.log(`[012] scheduler on (every ${everyMs / 1000}s; research ${env.ENABLE_RESEARCH === 'true' ? `after ${env.RESEARCH_AT ?? '05:30'} Toronto` : 'off'})`);
  return setInterval(loop, everyMs);
}
