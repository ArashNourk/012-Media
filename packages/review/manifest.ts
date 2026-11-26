import { hashJson, type IssueContent } from '../contracts';
import type { Repository } from '../persistence/repository';
import type { PreflightReport } from './preflight';

const md = (s: string | undefined) => (s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

/**
 * Source-review manifest for the approving editor: every published claim with
 * its source, excerpt, locator and verification checks; rejected candidates
 * and their reasons; consequence challenges; position gates, critique and
 * scorecard; continuity proposals; preflight; model/prompt provenance.
 */
export function buildManifest(repo: Repository, c: IssueContent, preflight: PreflightReport): string {
  const run = repo.getRun(c.runId);
  const claims = repo.listClaims(c.runId);
  const claimById = new Map(claims.map((x) => [x.id, x]));
  const signals = repo.listSignals(c.runId);
  const cons = repo.listConsequences(c.runId);
  const cands = repo.listCandidates(c.runId);
  const props = repo.listProposals(c.runId);
  const sources = repo.listRunSources(c.runId);
  const calls = repo.listLlmCalls(c.runId);
  const L: string[] = [];
  L.push(`# Source-review manifest — ${c.publicationLabel} — ${c.localIssueDate}`);
  L.push('');
  L.push(`Issue \`${c.issueId}\` · version ${c.version} · content hash \`${hashJson(c).slice(0, 16)}\` · run \`${c.runId}\``);
  L.push(`Research window: ${run.lookbackHours} h ending ${run.asOf} · analysis provider: \`${run.provider}\` · ${calls.length} recorded analysis calls`);
  L.push('');
  L.push('> Approval validates editorial release, not a scientific guarantee of truth. Check each claim against its source before approving.');
  L.push('');
  if (c.editorialNotes.length) {
    L.push('## Disclosed limitations');
    c.editorialNotes.forEach((n) => L.push(`- ${n}`));
    L.push('');
  }
  L.push('## Preflight');
  L.push('| check | result | severity | detail |');
  L.push('|---|---|---|---|');
  for (const k of preflight.checks) L.push(`| ${k.id} | ${k.passed ? 'pass' : '**FAIL**'} | ${k.severity} | ${md(k.detail)} |`);
  L.push('');
  L.push(`Blocking failures: **${preflight.blocking ? 'YES — approval refused' : 'none'}**`);
  L.push('');

  L.push('## 00 / SIGNAL — published');
  for (const e of c.signals) {
    const s = signals.find((x) => x.id === e.signalId)!;
    L.push(`### ${e.headline}`);
    L.push(`\`${s.id}\` · priority ${s.candidatePriority} · factors: ${Object.entries(s.factors).map(([k, v]) => `${k} ${v.score}`).join(', ')}${s.weakSignal ? ' · weak signal' : ''}`);
    L.push(`Selection rationale: ${s.selectionRationale}`);
    L.push('');
    L.push('| claim | type / stage | support | source & locator | excerpt | checks |');
    L.push('|---|---|---|---|---|---|');
    for (const id of s.claimIds) {
      const cl = claimById.get(id)!;
      const pv = cl.provenance[0];
      const failed = cl.verification.checks.filter((k) => !k.passed).map((k) => k.name);
      L.push(
        `| ${md(cl.text)} \`${cl.id}\` | ${cl.type} / ${cl.eventState} | ${cl.support}${cl.caveat ? ` — ${md(cl.caveat)}` : ''} | [${md(pv.publisher)}](${pv.canonicalUrl}) · ${md(pv.locator)} | “${md(pv.excerpt)}” | ${failed.length ? `failed: ${failed.join(', ')}` : `${cl.verification.checks.length} passed`} |`,
      );
    }
    L.push('');
  }

  L.push('## 00 / SIGNAL — not selected');
  const notSel = signals.filter((s) => s.editorialStatus !== 'accepted');
  if (!notSel.length) L.push('- none');
  for (const s of notSel) L.push(`- **${s.headline}** (\`${s.id}\`, priority ${s.candidatePriority}): ${s.rejectionReason ?? 'not selected'}`);
  const inel = repo.listAudit(c.runId).filter((a) => a.event === 'cluster.ineligible');
  for (const a of inel) L.push(`- cluster ineligible: ${md(String(a.detail))}`);
  const failedSources = sources.filter((s) => s.retrievalStatus !== 'ok');
  for (const s of failedSources) L.push(`- source not usable: ${s.requestedUrl} — ${s.retrievalStatus}${s.retrievalNote ? ` (${s.retrievalNote})` : ''}`);
  const unverified = claims.filter((x) => x.support === 'unverified' || x.support === 'contradicted');
  L.push('');
  L.push(`### Claims that failed verification (${unverified.length})`);
  for (const x of unverified) L.push(`- ${md(x.text)} \`${x.id}\` — ${x.support}: ${x.verification.checks.filter((k) => !k.passed).map((k) => `${k.name} (${md(k.detail)})`).join('; ')}`);
  L.push('');

  L.push('## 01 / CONSEQUENCE');
  for (const k of cons) {
    L.push(`### ${k.status === 'accepted' ? '' : '[HELD] '}${k.statement}`);
    L.push(`\`${k.id}\` · signals ${k.linkedSignalIds.join(', ')} · confidence ${k.evidenceConfidence} · horizon ${k.horizon}`);
    L.push(`- Causal chain: ${k.causalChain.join(' → ')}`);
    L.push(`- Assumptions: ${k.assumptions.join('; ')}`);
    L.push(`- Alternatives: ${k.alternatives.join('; ')}`);
    L.push(`- Disconfirming: ${k.disconfirmingIndicators.join('; ')}`);
    L.push(`- Observations: ${k.observedClaimIds.join(', ')} · ${k.inferenceNote}`);
    if (k.challenge) L.push(`- Challenge: **${k.challenge.verdict}** — ${k.challenge.neutralHeadlineTest}${k.challenge.findings.length ? ` | ${k.challenge.findings.join(' | ')}` : ''}`);
    if (k.holdReason) L.push(`- Held: ${k.holdReason}`);
    L.push('');
  }

  L.push('## 02 / POSITION');
  for (const p of cands) {
    L.push(`### [${p.status.toUpperCase()}] ${p.thesis}`);
    L.push(`\`${p.id}\` · ${p.kind} · proposed ${p.proposedDecision} → gated **${p.decision}** · confidence ${p.evidenceConfidence}`);
    if (p.rejectionReason) L.push(`- Rejected: ${p.rejectionReason}`);
    p.decisionGateNotes.forEach((n) => L.push(`- Gate: ${n}`));
    L.push(`- Counterargument: ${p.strongestCounterargument}`);
    L.push(`- Blocker: ${p.blocker} · Test: ${p.falsificationTest ?? '—'}`);
    if (p.critique) {
      L.push(`- Adversarial review: **${p.critique.verdict}** — decisive obstacle: ${p.critique.decisiveObstacle}`);
      p.critique.findings.forEach((f) => L.push(`  - [${f.severity}] ${f.category}: ${f.detail}`));
    }
    if (p.scorecard) {
      const sc = p.scorecard;
      L.push(`- Internal rubric (judgemental, not measured): archetype ${sc.operatorArchetype ?? 'omitted'} · priority ${sc.priority ?? 'not computed'}${sc.unscoredWeightedDimensions.length ? ` (unscored: ${sc.unscoredWeightedDimensions.join(', ')})` : ''}`);
      L.push(`  - ${Object.entries(sc.dimensions).map(([k, v]) => `${k} ${v.score ?? '?'}${v.unknown ? '(unknown)' : ''}`).join(', ')}`);
      if (sc.cautionFlags.length) L.push(`  - Caution: ${sc.cautionFlags.join('; ')}`);
    }
    L.push('');
  }

  L.push('## Continuity Ledger');
  if (!props.length) L.push('- no tracked position matched new evidence');
  for (const p of props) {
    const pos = repo.getPosition(p.positionId);
    L.push(`### ${p.positionId} — ${p.effect} → ${p.status}`);
    L.push(`- Original thesis (immutable): ${pos?.originalThesis ?? '?'}`);
    L.push(`- Matched by ${p.matchedBy.join(', ')}: ${p.matchDetail}`);
    L.push(`- ${p.previousStatus} → ${p.proposedStatus} · conditions ${p.conditionRefs.join(', ') || '—'} · new claims ${p.newClaimIds.join(', ') || '—'}`);
    L.push(`- Why this alters the judgement: ${p.whyThisAltersJudgment}`);
    if (!p.gate.passed) L.push(`- Gate failed: ${p.gate.reasons.join('; ')}`);
    L.push('');
  }

  L.push('## Analysis provenance');
  L.push('| task | prompt | provider | model / producer | input hash |');
  L.push('|---|---|---|---|---|');
  for (const k of calls) L.push(`| ${k.task} | ${k.prompt_version} | ${k.provider} | ${md(String(k.model))} | \`${String(k.input_sha256).slice(0, 12)}\` |`);
  L.push('');
  L.push('To approve: `npm run 012 -- approve --issue ' + c.issueId + ' --editor "<name>" --sha ' + hashJson(c).slice(0, 16) + '`');
  return L.join('\n');
}
