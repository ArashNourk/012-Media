#!/usr/bin/env node
/**
 * 012 operations CLI — the private operator interface (PRD P1: "safe
 * command-line operations"). No public accounts or dashboards.
 *
 *   npm run 012 -- <command> [--flags]
 */
import { readFileSync } from 'node:fs';
import { PUBLICATION_01, hashJson } from '../packages/contracts';
import { seedPosition, SeedFile } from '../packages/intelligence/continuity/seed';
import { prepareEdition } from '../packages/orchestrator/prepareEdition';
import { handleUnsubscribe } from '../packages/publishing/unsubscribe';
import { tick } from '../packages/publishing/scheduler';
import { approveIssue, holdIssue, manifestKey, preflightKey, requestRevision } from '../packages/review/approval';
import { buildManifest } from '../packages/review/manifest';
import { runEditorialPreflight, type PreflightReport } from '../packages/review/preflight';
import { torontoParts } from '../packages/publishing/schedule';
import { createDeps } from './deps';

function parse(argv: string[]) {
  const [cmd, ...rest] = argv;
  const flags: Record<string, string | boolean | string[]> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    const v = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true;
    if (k === 'note' && typeof v === 'string') flags[k] = [...((flags[k] as string[]) ?? []), v];
    else flags[k] = v;
  }
  return { cmd, flags };
}

const str = (v: unknown, name: string): string => {
  if (typeof v !== 'string' || !v) throw new Error(`--${name} is required`);
  return v;
};

async function main() {
  const { cmd, flags } = parse(process.argv.slice(2));
  const deps = createDeps();
  const { ctx, publishing, store } = deps;
  const repo = ctx.repo;
  const out = (x: unknown) => console.log(typeof x === 'string' ? x : JSON.stringify(x, null, 2));

  switch (cmd) {
    case 'migrate':
      return out('migrations applied');

    case 'seed': {
      const seed = SeedFile.parse(JSON.parse(readFileSync(str(flags.file, 'file'), 'utf8')));
      const r = await seedPosition(ctx, seed);
      if ('pending' in r) return out(`seed verification awaiting analysis responses in ${deps.dataDir}/handoff/`);
      return out({ seeded: r.position.id, status: r.position.currentStatus, claims: r.claims.map((c) => ({ id: c.id, support: c.support })) });
    }

    case 'prepare': {
      const localIssueDate = str(flags.date, 'date');
      const asOf = typeof flags['as-of'] === 'string' ? new Date(flags['as-of']).toISOString() : new Date().toISOString();
      const r = await prepareEdition(ctx, publishing, {
        localIssueDate,
        asOf,
        lookbackHours: flags['lookback-hours'] ? Number(flags['lookback-hours']) : undefined,
        editorialNotes: (flags.note as string[]) ?? [],
        liveLinkCheck: !!flags['live-links'],
        fresh: !!flags.fresh,
      });
      if (r.status === 'awaiting_analysis') return out({ status: r.status, run: r.run.id, pending: r.pending });
      if (r.status === 'drafted')
        return out({
          status: r.status,
          run: r.run.id,
          issue: r.issue.id,
          state: r.issue.state,
          version: r.issue.version,
          contentSha256: r.issue.contentSha256,
          blocking: r.preflight.blocking,
          failed: r.preflight.checks.filter((c) => !c.passed).map((c) => `${c.severity}: ${c.id} — ${c.detail}`),
          manifest: store.localPath(r.manifestKey),
          previewPdf: r.previewPdfKey ? store.localPath(r.previewPdfKey) : undefined,
        });
      return out({ status: r.status, run: r.run.id, issue: 'issue' in r ? r.issue?.id : undefined, reason: r.reason });
    }

    case 'preflight': {
      const issue = repo.getIssue(str(flags.issue, 'issue'));
      if (!issue.content) throw new Error('no content');
      const prev = JSON.parse((await store.getText(preflightKey(issue.id, issue.content.version))) ?? 'null') as PreflightReport | null;
      const adv = prev?.checks.find((c) => c.id === 'adversarial_draft_check');
      let pdf = prev?.checks.find((c) => c.id === 'pdf_preview_render');
      try {
        const pv = await publishing.renderPreview(issue.id);
        const missing = issue.content.sources.map((s) => s.url).filter((u) => !pv.pdfInfo.linkUris.includes(u));
        pdf = { id: 'pdf_preview_render', passed: pv.pdfInfo.hasFonts && pv.pdfInfo.pages > 0 && !missing.length, severity: 'block', detail: `${pv.pdfInfo.pages} page(s), text fonts ${pv.pdfInfo.hasFonts ? 'present' : 'MISSING'}, ${pv.pdfInfo.linkUris.length} active links${missing.length ? `; citations missing from PDF: ${missing.join(', ')}` : '; every source cited in the PDF'}${pv.pdfInfo.isTagged ? ', tagged' : ''}` };
      } catch (e) {
        pdf = { id: 'pdf_preview_render', passed: false, severity: 'block', detail: `PDF generation failed: ${e instanceof Error ? e.message : String(e)}` };
      }
      const report = await runEditorialPreflight(repo, issue.content, { fetcher: ctx.fetcher, liveLinkCheck: !!flags['live-links'], adversarialVerdict: undefined });
      // carry forward model-dependent checks from the stored report for this exact version
      report.checks = report.checks.filter((c) => c.id !== 'adversarial_draft_check');
      if (adv) report.checks.push(adv);
      if (pdf) report.checks.push(pdf);
      report.blocking = report.checks.some((c) => !c.passed && c.severity === 'block');
      await store.put(preflightKey(issue.id, issue.content.version), JSON.stringify(report, null, 2), 'application/json');
      await store.put(manifestKey(issue.id, issue.content.version), buildManifest(repo, issue.content, report), 'text/markdown');
      return out({ blocking: report.blocking, checks: report.checks.map((c) => `${c.passed ? 'pass' : 'FAIL'} [${c.severity}] ${c.id}: ${c.detail}`), manifest: store.localPath(manifestKey(issue.id, issue.content.version)) });
    }

    case 'approve': {
      const r = await approveIssue(repo, store, { issueId: str(flags.issue, 'issue'), editor: str(flags.editor, 'editor'), note: (flags.note as string[] | undefined)?.join(' '), expectedSha256: typeof flags.sha === 'string' ? flags.sha : undefined });
      return out({ approved: r.issue.id, state: r.issue.state, approvalId: r.approvalId, revisions: r.revisions, sha: r.issue.approvedSha256 });
    }

    case 'request-revision':
      return out(requestRevision(repo, str(flags.issue, 'issue'), str(flags.editor, 'editor'), ((flags.note as string[]) ?? []).join(' ')).state);

    case 'hold':
      return out(holdIssue(repo, str(flags.issue, 'issue'), str(flags.editor, 'editor'), ((flags.note as string[]) ?? []).join(' ')).state);

    case 'render': {
      const r = await publishing.renderApproved(str(flags.issue, 'issue'));
      return out({ state: r.state, html: store.localPath(r.htmlKey!), pdf: store.localPath(r.pdfKey!) });
    }

    case 'subscriber:add-test': {
      const s = repo.addSubscriber({
        email: str(flags.email, 'email'),
        publicationId: PUBLICATION_01.id,
        status: 'subscribed',
        consentTextVersion: str(flags['consent-version'], 'consent-version'),
        consentAt: repo.now(),
        emailVerifiedAt: flags.verified ? repo.now() : undefined,
        isTest: true,
      });
      return out({ subscriber: s.id, status: s.status, verified: !!s.emailVerifiedAt });
    }

    case 'unsubscribe':
      return out(handleUnsubscribe(repo, str(flags.token, 'token')));

    case 'tick': {
      const simulated = typeof flags.now === 'string';
      const now = simulated ? new Date(flags.now as string) : new Date();
      if (simulated && !deps.mailer.sandbox) throw new Error('--now (simulated clock) is only allowed with the sandbox outbox mailer');
      const r = await tick(repo, publishing, now, { simulatedClock: simulated });
      return out({ now: now.toISOString(), toronto: torontoParts(now), ...r });
    }

    case 'status': {
      const date = typeof flags.date === 'string' ? flags.date : torontoParts(new Date()).localDate;
      const issue = repo.getIssueByDate(PUBLICATION_01.id, date);
      const run = repo.latestRun(PUBLICATION_01.id, date);
      return out({
        date,
        run: run && { id: run.id, stage: run.stage, status: run.status, detail: run.statusDetail, llmCalls: run.llmCalls },
        issue: issue && { id: issue.id, state: issue.state, version: issue.version, contentSha256: issue.contentSha256, approvedSha256: issue.approvedSha256, sentAt: issue.sentAt },
        stateLog: issue ? repo.listIssueStateLog(issue.id).map((r) => `${r.at} ${r.from_state ?? '∅'} → ${r.to_state} (${r.actor}) ${r.note ?? ''}`) : [],
        positions: repo.listLedgerPositions(PUBLICATION_01.id).map((p) => ({ id: p.id, status: p.currentStatus, revisions: repo.listRevisions(p.id).length })),
        dispatch: issue ? repo.getDispatchByIssue(issue.id) : undefined,
        deliveries: issue && repo.getDispatchByIssue(issue.id) ? repo.listDeliveries(String(repo.getDispatchByIssue(issue.id)!.id)).map((d) => ({ subscriber: d.subscriber_id, status: d.status, attempts: d.attempts, id: d.provider_message_id })) : [],
      });
    }

    case 'hash': {
      const issue = repo.getIssue(str(flags.issue, 'issue'));
      return out({ contentSha256: issue.content ? hashJson(issue.content) : null });
    }

    default:
      out(`012 operations CLI
  migrate
  seed --file seeds/<file>.json
  prepare --date YYYY-MM-DD [--as-of ISO] [--lookback-hours N] [--note "..."] [--live-links] [--fresh]
  preflight --issue ISS-… [--live-links]
  approve --issue ISS-… --editor "Name" [--sha <prefix>] [--note "..."]
  request-revision --issue ISS-… --editor "Name" --note "..."
  hold --issue ISS-… --editor "Name" --note "..."
  render --issue ISS-…
  subscriber:add-test --email a@b --consent-version v1 --verified
  unsubscribe --token <token>
  tick [--now ISO]   (--now only with the sandbox outbox)
  status [--date YYYY-MM-DD]`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
