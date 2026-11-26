import { stableId, type Claim, type Consequence, type Signal } from '../../contracts';
import type { RunRecord } from '../../persistence/repository';
import type { EngineContext } from '../context';
import { untracedNumbers } from '../shared/numbers';
import { CHALLENGE, MAP_MECHANISMS, REVISE, SYNTHESIZE, type SignalForAnalysis, type TrackedPositionBrief } from './tasks';

export const MAX_CONSEQUENCES = 3;

export function signalForAnalysis(s: Signal, claims: Map<string, Claim>): SignalForAnalysis {
  return {
    signalId: s.id,
    headline: s.headline,
    eventAt: s.eventAt,
    summary: s.summary,
    qualifications: s.evidenceQualifications,
    claims: s.claimIds
      .map((id) => claims.get(id))
      .filter((c): c is Claim => !!c && (c.support === 'supported' || c.support === 'qualified'))
      .map((c) => ({ claimId: c.id, text: c.text, type: c.type, eventState: c.eventState, support: c.support, caveat: c.caveat })),
  };
}

/**
 * 012 Consequence Engine (01): map actors and mechanisms per signal,
 * synthesise bounded cross-signal consequences, then run a distinct
 * challenge pass. Deterministic validation enforces the contract: accepted
 * signals only, supported claims only, numbers traceable, assumptions,
 * alternatives and disconfirming indicators present.
 */
export class ConsequenceEngine {
  constructor(private ctx: EngineContext) {}

  async synthesize(run: RunRecord, accepted: Signal[], claims: Claim[], tracked: TrackedPositionBrief[]): Promise<Consequence[]> {
    const { runner, repo } = this.ctx;
    if (!accepted.length) return [];
    const claimMap = new Map(claims.map((c) => [c.id, c]));
    const sigs = accepted.map((s) => signalForAnalysis(s, claimMap));

    const mechanisms = (await runner.runAll(MAP_MECHANISMS, sigs.map((signal) => ({ signal })), run.id)).map((r) => r.output);
    const synth = (await runner.runAll(SYNTHESIZE, [{ signals: sigs, mechanisms, trackedPositions: tracked }], run.id))[0].output;

    const acceptedIds = new Set(accepted.map((s) => s.id));
    const allowedClaims = new Map(sigs.flatMap((s) => s.claims.map((c) => [c.claimId, c] as const)));
    const trackedIds = new Set(tracked.map((t) => t.positionId));

    const validate = (c: (typeof synth.consequences)[number], idx: number) => {
      const problems: string[] = [];
      const badSignals = c.linkedSignalIds.filter((id) => !acceptedIds.has(id));
      if (!c.linkedSignalIds.length) problems.push('no linked signals');
      if (badSignals.length) problems.push(`references signals that are not accepted: ${badSignals.join(', ')}`);
      const badClaims = c.observedClaimIds.filter((id) => !allowedClaims.has(id));
      if (badClaims.length) problems.push(`rests on claims that are not verified signal claims: ${badClaims.join(', ')}`);
      if (!c.observedClaimIds.length) problems.push('no supporting observations');
      if (!c.assumptions.length) problems.push('no stated assumption');
      if (!c.alternatives.length) problems.push('no competing explanation');
      if (!c.disconfirmingIndicators.length) problems.push('no disconfirming indicator');
      if (c.causalChain.length < 2) problems.push('causal chain lacks intermediate mechanism');
      const evidence = c.observedClaimIds.map((id) => allowedClaims.get(id)?.text ?? '');
      const untraced = untracedNumbers(`${c.statement} ${c.mechanism}`, evidence);
      if (untraced.length) problems.push(`numbers not traceable to cited claims: ${untraced.join(', ')}`);
      const links = c.continuityLinks.filter((l) => trackedIds.has(l.positionId));
      return { c, idx, problems, links, revised: false };
    };
    const evidenceFor = (c: (typeof synth.consequences)[number]) => c.observedClaimIds.map((id) => allowedClaims.get(id)).filter((x): x is NonNullable<typeof x> => !!x);

    let prelim = synth.consequences.map((c, idx) => validate(c, idx));
    let challenges = (await runner.runAll(CHALLENGE, prelim.map(({ c }) => ({ consequence: c, claims: evidenceFor(c) })), run.id)).map((r) => r.output);

    // "Return for revision": one bounded round for contract-clean consequences the challenger marked "revise".
    const toRevise = prelim.map((p, i) => ({ p, i })).filter(({ p, i }) => !p.problems.length && challenges[i].verdict === 'revise');
    if (toRevise.length) {
      const revised = (await runner.runAll(REVISE, toRevise.map(({ p, i }) => ({ consequence: p.c, findings: challenges[i].findings, claims: evidenceFor(p.c) })), run.id)).map((r) => r.output);
      const reval = toRevise.map(({ p }, k) => ({ ...validate(revised[k], p.idx), revised: true }));
      const rech = (await runner.runAll(CHALLENGE, reval.map(({ c }) => ({ consequence: c, claims: evidenceFor(c) })), run.id)).map((r) => r.output);
      prelim = prelim.slice();
      challenges = challenges.slice();
      toRevise.forEach(({ i }, k) => {
        prelim[i] = reval[k];
        challenges[i] = { ...rech[k], findings: [...rech[k].findings, ...(rech[k].verdict === 'pass' ? ['(passed after one revision round)'] : ['(held after one revision round)'])] };
      });
    }

    let acceptedCount = 0;
    const out: Consequence[] = prelim.map(({ c, idx, problems, links }, i) => {
      const ch = challenges[i];
      const held = problems.length > 0 || ch.verdict !== 'pass' || acceptedCount >= MAX_CONSEQUENCES;
      const holdReason = problems.length
        ? `contract violation: ${problems.join('; ')}`
        : ch.verdict !== 'pass'
          ? `challenge verdict ${ch.verdict}: ${ch.findings.join('; ')}`
          : acceptedCount >= MAX_CONSEQUENCES
            ? `outside the 2–3 consequence editorial limit`
            : undefined;
      if (!held) acceptedCount++;
      return {
        id: stableId('consequence', run.id, String(idx), c.statement),
        runId: run.id,
        linkedSignalIds: c.linkedSignalIds.length ? c.linkedSignalIds : ['none'],
        statement: c.statement,
        mechanism: c.mechanism,
        causalChain: c.causalChain.length >= 2 ? c.causalChain : [...c.causalChain, '(missing)', '(missing)'].slice(0, 2),
        affectedActors: c.affectedActors.length ? c.affectedActors : ['(none stated)'],
        assumptions: c.assumptions.length ? c.assumptions : ['(none stated)'],
        alternatives: c.alternatives.length ? c.alternatives : ['(none stated)'],
        disconfirmingIndicators: c.disconfirmingIndicators.length ? c.disconfirmingIndicators : ['(none stated)'],
        baseline: c.baseline,
        constraints: c.constraints,
        firstOrderEffects: c.firstOrderEffects,
        secondOrderEffects: c.secondOrderEffects,
        observedClaimIds: c.observedClaimIds.length ? c.observedClaimIds : ['none'],
        inferenceNote: c.inferenceNote,
        horizon: c.horizon,
        evidenceConfidence: c.evidenceConfidence,
        confidenceRationale: c.confidenceRationale,
        continuityLinks: links,
        challenge: ch,
        status: held ? 'held' : 'accepted',
        holdReason,
      };
    });
    out.forEach((c) => repo.saveConsequence(c));
    repo.audit('consequence', 'synthesis.completed', run.id, { accepted: out.filter((c) => c.status === 'accepted').length, held: out.filter((c) => c.status === 'held').length });
    return out;
  }
}
