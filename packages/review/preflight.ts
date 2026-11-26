import { normalizeForMatch } from '../connectors/http/html';
import { canonicalizeUrl, type Fetcher } from '../connectors/http/retrieve';
import type { Claim, IssueContent } from '../contracts';
import type { Repository } from '../persistence/repository';
import { untracedNumbers } from '../intelligence/shared/numbers';
import { readerFacingText } from './assemble';

export interface PreflightCheck {
  id: string;
  passed: boolean;
  severity: 'block' | 'warn';
  detail: string;
}

export interface PreflightReport {
  at: string;
  checks: PreflightCheck[];
  blocking: boolean;
}

const URL_RE = /https?:\/\/[^\s)"'<>\]]+/g;

function weekdayOf(localDate: string): number {
  return new Date(`${localDate}T12:00:00Z`).getUTCDay();
}

export function issueClaimIds(repo: Repository, c: IssueContent): { ids: Set<string>; missing: string[] } {
  const ids = new Set<string>();
  const missing: string[] = [];
  const signals = repo.listSignals(c.runId);
  for (const e of c.signals) {
    const s = signals.find((x) => x.id === e.signalId);
    if (!s) missing.push(`signal ${e.signalId}`);
    else s.claimIds.forEach((x) => ids.add(x));
  }
  const cons = repo.listConsequences(c.runId);
  for (const e of c.consequences) {
    const k = cons.find((x) => x.id === e.consequenceId);
    if (!k) missing.push(`consequence ${e.consequenceId}`);
    else k.observedClaimIds.forEach((x) => ids.add(x));
  }
  if (c.position) {
    const cand = repo.listCandidates(c.runId).find((x) => x.status === 'selected');
    if (!cand) missing.push(`selected position candidate for ${c.position.positionId}`);
    else cand.supportingClaimIds.forEach((x) => ids.add(x));
  }
  for (const e of c.continuity) {
    const p = repo.getProposal(e.proposalId);
    if (!p) missing.push(`continuity proposal ${e.proposalId}`);
    else p.newClaimIds.forEach((x) => ids.add(x));
  }
  return { ids, missing };
}

/**
 * Automated editorial preflight (Architecture §9). Blocking failures prevent
 * approval; warnings are shown to the editor in the source-review manifest.
 */
export async function runEditorialPreflight(
  repo: Repository,
  content: IssueContent,
  opts: { fetcher?: Fetcher; liveLinkCheck: boolean; adversarialVerdict?: { verdict: string; findings: { severity: string; detail: string; section: string }[] } },
): Promise<PreflightReport> {
  const checks: PreflightCheck[] = [];
  const add = (id: string, passed: boolean, severity: 'block' | 'warn', detail: string) => checks.push({ id, passed, severity, detail });

  // 1. Claim-to-source support complete
  const { ids, missing } = issueClaimIds(repo, content);
  const claims = [...ids].map((id) => repo.getClaim(id)).filter((c): c is Claim => !!c);
  const weak = claims.filter((c) => c.support !== 'supported' && c.support !== 'qualified');
  add('records_connected', missing.length === 0, 'block', missing.length ? `missing linked records: ${missing.join(', ')}` : '00/01/02 and continuity records resolve to stored engine outputs');
  add(
    'claim_support_complete',
    weak.length === 0 && claims.length === ids.size && claims.length > 0,
    'block',
    weak.length ? `claims not verified: ${weak.map((c) => `${c.id} (${c.support})`).join(', ')}` : `${claims.length} claims, all supported or qualified`,
  );

  // 2. Every source link is a retrieved article; no URL in prose that was not retrieved
  const srcProblems: string[] = [];
  for (const s of content.sources) {
    const doc = repo.getSource(s.sourceId);
    if (!doc) srcProblems.push(`${s.sourceId} not in source store`);
    else if (doc.retrievalStatus !== 'ok') srcProblems.push(`${s.url}: ${doc.retrievalStatus}`);
    else if (doc.canonicalUrl !== s.url) srcProblems.push(`${s.url} ≠ retrieved ${doc.canonicalUrl}`);
  }
  for (const c of claims) if (!content.sources.some((s) => s.sourceId === c.provenance[0].sourceId)) srcProblems.push(`claim ${c.id} source ${c.provenance[0].sourceId} not cited in Sources`);
  add('sources_are_retrieved_articles', srcProblems.length === 0, 'block', srcProblems.join('; ') || `${content.sources.length} sources, all retrieved article pages`);

  const known = new Set(content.sources.map((s) => s.url));
  const strayUrls = readerFacingText(content)
    .flatMap((t) => t.match(URL_RE) ?? [])
    .map((u) => {
      try {
        return canonicalizeUrl(u.replace(/[.,;]+$/, ''));
      } catch {
        return u;
      }
    })
    .filter((u) => !known.has(u));
  add('no_unretrieved_citations', strayUrls.length === 0, 'block', strayUrls.length ? `URLs in text that were never retrieved: ${strayUrls.join(', ')}` : 'no citations outside the retrieved source list');

  // 3. Live link check
  if (opts.liveLinkCheck && opts.fetcher) {
    const broken: string[] = [];
    for (const s of content.sources) {
      try {
        const r = await opts.fetcher.get(s.url);
        if (r.status !== 200) broken.push(`${s.url} → HTTP ${r.status}`);
        else if (canonicalizeUrl(r.finalUrl) !== s.url) broken.push(`${s.url} redirects to ${r.finalUrl}`);
      } catch (e) {
        broken.push(`${s.url} → ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    add('links_resolve', broken.length === 0, 'block', broken.join('; ') || `${content.sources.length} links resolved to the intended pages`);
  } else add('links_resolve', true, 'warn', 'live link check not run (run with --live-links before approval)');

  // 4. Dates and timezone
  const dateProblems: string[] = [];
  const wd = weekdayOf(content.localIssueDate);
  if (wd === 0 || wd === 6) dateProblems.push(`${content.localIssueDate} is not a Monday–Friday publication date`);
  for (const s of content.signals) if (s.eventAt && s.eventAt.slice(0, 10) > content.localIssueDate) dateProblems.push(`signal ${s.signalId} event date ${s.eventAt} is after the issue date`);
  for (const s of content.sources) if (!s.publishedAt) dateProblems.push(`source ${s.url} has no publication date`);
  add('dates_verified', dateProblems.length === 0, 'block', dateProblems.join('; ') || 'issue date is a weekday (America/Toronto); event and publication dates present and not in the future');

  // 5. Numbers in reader-facing text trace to verified claims (units/values consistent)
  const evidence = claims.flatMap((c) => [c.text, ...c.quantities.map((q) => q.value)]);
  const untraced = untracedNumbers(readerFacingText(content).join(' \n '), evidence);
  add('numbers_traceable', untraced.length === 0, 'block', untraced.length ? `numbers not traceable to verified claims: ${untraced.join(', ')}` : 'every number traces to a verified claim');

  // 6. Continuity attributable
  const contProblems: string[] = [];
  for (const e of content.continuity) {
    const p = repo.getProposal(e.proposalId);
    if (!p) continue;
    if (p.status !== 'proposed' && p.status !== 'ratified') contProblems.push(`${e.proposalId} status ${p.status}`);
    if (!p.gate.passed) contProblems.push(`${e.proposalId} failed its gate`);
    if (!e.newSourceIds.length) contProblems.push(`${e.positionId} update has no new source`);
  }
  add('continuity_attributable', contProblems.length === 0, 'block', contProblems.join('; ') || `${content.continuity.length} continuity update(s), each with new cited evidence`);

  // 7. Editorial grammar and length bounds
  const words = readerFacingText(content).join(' ').split(/\s+/).filter(Boolean).length;
  const counts = `${content.signals.length} signals, ${content.consequences.length} consequences, ${content.position ? 1 : 0} position, ${content.continuity.length} continuity`;
  add('editorial_grammar', content.signals.length >= 1 && content.signals.length <= 5 && content.consequences.length <= 3 && content.continuity.length <= 2, 'block', counts);
  add('signal_volume', content.signals.length >= 3, 'warn', content.signals.length >= 3 ? counts : `quiet edition: only ${content.signals.length} verified signal(s) — publish shorter or hold`);
  add('reading_length', words >= 400 && words <= 1700, 'warn', `${words} words (target ≈ 4–6 minutes)`);

  // 8. Copyright excerpt bounds
  const longQuotes = claims.filter((c) => (c.provenance[0].excerpt?.length ?? 0) > 320);
  add('excerpt_bounds', longQuotes.length === 0, 'block', longQuotes.length ? `excerpts over bound: ${longQuotes.map((c) => c.id).join(', ')}` : 'all stored excerpts within 320 characters; no excerpts reproduced in the edition');

  // 9. Source diversity
  const pubs = new Set(content.sources.map((s) => s.publisher));
  add('source_diversity', pubs.size > 1, 'warn', pubs.size > 1 ? `${pubs.size} publishers` : `single publisher source base (${[...pubs].join('')}): disclose and seek independent corroboration`);

  // 10. Adversarial draft check
  if (opts.adversarialVerdict) {
    const v = opts.adversarialVerdict;
    const blockers = v.findings.filter((f) => f.severity === 'blocking');
    add('adversarial_draft_check', v.verdict !== 'hold' && blockers.length === 0, 'block', `${v.verdict}${v.findings.length ? `: ${v.findings.map((f) => `[${f.severity}] ${f.section}: ${f.detail}`).join(' | ')}` : ''}`);
  } else add('adversarial_draft_check', false, 'block', 'adversarial draft check did not run');

  // 11. Qualifications preserved for self-reported numbers
  const selfReported = claims.filter((c) => /Reported by|Self-reported/.test(c.caveat ?? ''));
  const allText = normalizeForMatch(readerFacingText(content).join(' '));
  const attributed = /self-reported|according to|reported by|says|said|states|stated|announced/.test(allText);
  add('qualifications_preserved', !selfReported.length || attributed, 'warn', selfReported.length ? (attributed ? 'self-reported figures carry attribution language' : 'self-reported figures appear without attribution language') : 'no self-reported figures');

  return { at: repo.now(), checks, blocking: checks.some((c) => !c.passed && c.severity === 'block') };
}
