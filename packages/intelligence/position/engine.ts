import { stableId, type Claim, type Consequence, type PositionCandidate, type PositionDecision, type Scorecard } from '../../contracts';
import type { RunRecord } from '../../persistence/repository';
import type { EngineContext } from '../context';
import { untracedNumbers } from '../shared/numbers';
import { jaccard, titleTokens } from '../../connectors/http/similarity';
import { CRITICAL_FOR_PURSUE, computePriority } from './rubric';
import { ADVERSARIAL_REVIEW, FINALIZE, GENERATE_CANDIDATES, type CandidateOutput } from './tasks';

function addDays(localDate: string, days: number): string {
  const d = new Date(`${localDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const DUPLICATE_THESIS_THRESHOLD = 0.5;

export interface PositionResult {
  candidates: PositionCandidate[];
  selected: PositionCandidate | null;
  noPositionStatement?: string;
  selectionRationale: string;
}

/**
 * 012 Position Engine (02): generate candidate positions → map actors,
 * demand, competitors, feasibility and risk → 14-dimension rubric where
 * commercial → distinct adversarial review → falsification test → editorial
 * selection. Deterministic gates prevent PURSUE when critical factors are
 * unknown, the critique blocks, or a named competitor lacks evidence.
 */
export class PositionEngine {
  constructor(private ctx: EngineContext) {}
  private trackedTheses: { id: string; thesis: string }[] = [];

  /**
   * @param signalClaimIds verified claims of the accepted signals: positions may
   *   rest on these "explicitly identified additional facts" besides the
   *   consequences' own observations, and on nothing else.
   */
  async evaluate(run: RunRecord, consequences: Consequence[], claims: Claim[], signalClaimIds: string[]): Promise<PositionResult> {
    const { runner, repo } = this.ctx;
    const accepted = consequences.filter((c) => c.status === 'accepted');
    if (!accepted.length) {
      return { candidates: [], selected: null, selectionRationale: 'No accepted consequence; no position can be formed.', noPositionStatement: undefined };
    }
    const claimMap = new Map(claims.map((c) => [c.id, c]));
    const allowedClaimIds = new Set(accepted.flatMap((c) => c.observedClaimIds));
    for (const id of signalClaimIds) allowedClaimIds.add(id);
    const claimBrief = [...allowedClaimIds]
      .map((id) => claimMap.get(id))
      .filter((c): c is Claim => !!c && (c.support === 'supported' || c.support === 'qualified'))
      .map((c) => ({ claimId: c.id, text: c.text, type: c.type, eventState: c.eventState, support: c.support, caveat: c.caveat }));
    const tracked = repo.listLedgerPositions(run.publicationId);
    const trackedIds = new Set(tracked.map((t) => t.id));
    this.trackedTheses = tracked.map((t) => ({ id: t.id, thesis: t.originalThesis }));

    const gen = (
      await runner.runAll(
        GENERATE_CANDIDATES,
        [
          {
            localIssueDate: run.localIssueDate,
            consequences: accepted.map((c) => ({
              consequenceId: c.id,
              statement: c.statement,
              mechanism: c.mechanism,
              assumptions: c.assumptions,
              alternatives: c.alternatives,
              evidenceConfidence: c.evidenceConfidence,
              observedClaimIds: c.observedClaimIds,
            })),
            claims: claimBrief,
            trackedPositions: tracked.map((t) => ({ positionId: t.id, thesis: t.originalThesis, status: t.currentStatus })),
          },
        ],
        run.id,
      )
    )[0].output;

    const allowed = new Set(claimBrief.map((c) => c.claimId));
    const acceptedIds = new Set(accepted.map((c) => c.id));

    const critiques = (
      await runner.runAll(
        ADVERSARIAL_REVIEW,
        gen.candidates.map((c) => ({ candidate: c, claims: claimBrief.filter((x) => c.supportingClaimIds.includes(x.claimId)) })),
        run.id,
      )
    ).map((r) => r.output);

    const candidates = gen.candidates.map((c, idx) => this.gate(run, c, idx, critiques[idx], allowed, acceptedIds, trackedIds, claimMap));
    const eligible = candidates.filter((c) => c.status === 'candidate');

    let selected: PositionCandidate | null = null;
    let selectionRationale = 'No candidate passed the position gates.';
    let noPositionStatement: string | undefined;
    if (eligible.length) {
      const fin = (
        await runner.runAll(
          FINALIZE,
          [
            {
              candidates: eligible.map((c) => ({
                candidateId: c.id,
                kind: c.kind,
                thesis: c.thesis,
                decision: c.decision,
                gateNotes: c.decisionGateNotes,
                critiqueVerdict: c.critique?.verdict ?? 'none',
                decisiveObstacle: c.critique?.decisiveObstacle ?? '',
                priority: c.scorecard?.priority ?? null,
                evidenceConfidence: c.evidenceConfidence,
              })),
            },
          ],
          run.id,
        )
      )[0].output;
      selectionRationale = fin.rationale;
      noPositionStatement = fin.noPositionStatement ?? undefined;
      if (fin.selectedCandidateId) {
        selected = eligible.find((c) => c.id === fin.selectedCandidateId) ?? null;
        if (!selected) selectionRationale = `finalizer selected unknown candidate ${fin.selectedCandidateId}; no position selected`;
      }
    }
    const final = candidates.map((c) => (selected && c.id === selected.id ? { ...c, status: 'selected' as const } : c));
    final.forEach((c) => repo.saveCandidate(c));
    repo.audit('position', 'evaluation.completed', run.id, { candidates: final.length, selected: selected?.id ?? null, selectionRationale });
    return { candidates: final, selected: selected ? { ...selected, status: 'selected' } : null, noPositionStatement, selectionRationale };
  }

  gate(
    run: RunRecord,
    c: CandidateOutput,
    idx: number,
    critique: PositionCandidate['critique'] extends infer T ? Omit<NonNullable<T>, 'id' | 'targetId' | 'promptVersion'> : never,
    allowedClaims: Set<string>,
    acceptedConsequences: Set<string>,
    trackedPositions: Set<string>,
    claimMap: Map<string, Claim>,
  ): PositionCandidate {
    const id = stableId('positionCandidate', run.id, String(idx), c.thesis);
    const notes: string[] = [];
    let rejection: string | undefined;
    let status: PositionCandidate['status'] = 'candidate';

    const badClaims = c.supportingClaimIds.filter((x) => !allowedClaims.has(x));
    const goodClaims = c.supportingClaimIds.filter((x) => allowedClaims.has(x));
    const badCons = c.linkedConsequenceIds.filter((x) => !acceptedConsequences.has(x));
    if (badClaims.length) rejection = `cites claims that are not verified: ${badClaims.join(', ')}`;
    else if (!goodClaims.length) rejection = 'no supporting verified claims';
    else if (badCons.length) rejection = `references consequences that are not accepted: ${badCons.join(', ')}`;
    else if (!c.linkedConsequenceIds.length) rejection = 'not linked to an accepted consequence';

    const competitors = c.competitors.filter((k) => k.claimIds.length && k.claimIds.every((x) => allowedClaims.has(x)));
    for (const k of c.competitors.filter((k) => !competitors.includes(k))) notes.push(`named competitor "${k.name}" removed: no verified evidence`);

    const evidenceText = goodClaims.map((x) => claimMap.get(x)?.text ?? '');
    const untraced = untracedNumbers(`${c.thesis} ${c.whyNow} ${c.economicMechanism}`, evidenceText);
    if (!rejection && untraced.length) rejection = `numbers not traceable to cited claims: ${untraced.join(', ')}`;

    let decision: PositionDecision = c.proposedDecision;
    if (critique.verdict === 'block' && !rejection) rejection = `adversarial review blocked: ${critique.decisiveObstacle}`;
    const blockingFindings = critique.findings.filter((f) => f.severity === 'blocking');
    if (decision === 'PURSUE' && (blockingFindings.length || critique.verdict !== 'pass')) {
      decision = 'MONITOR';
      notes.push('PURSUE downgraded to MONITOR: adversarial review did not pass cleanly');
    }

    let scorecard: Scorecard | undefined;
    if (c.commercial) {
      if (!c.rubric) {
        if (decision === 'PURSUE') {
          decision = 'MONITOR';
          notes.push('PURSUE downgraded: commercial hypothesis lacks the 14-dimension assessment');
        }
      } else {
        const { priority, unscored, cautionFlags } = computePriority(c.rubric.dimensions);
        scorecard = {
          id: stableId('scorecard', id),
          candidateId: id,
          operatorArchetype: c.rubric.operatorArchetype,
          dimensions: c.rubric.dimensions,
          priority,
          unscoredWeightedDimensions: unscored,
          cautionFlags,
        };
        if (!c.rubric.operatorArchetype && !c.rubric.dimensions.executionFit.unknown) notes.push('execution fit scored without a named operator archetype: treated as unknown');
        const criticalUnknown = CRITICAL_FOR_PURSUE.filter((k) => c.rubric!.dimensions[k].unknown || c.rubric!.dimensions[k].score === null);
        if (decision === 'PURSUE' && criticalUnknown.length) {
          decision = 'MONITOR';
          notes.push(`PURSUE prohibited: critical factor(s) unknown — ${criticalUnknown.join(', ')}`);
        }
        if (decision === 'PURSUE' && (c.rubric.dimensions.evidenceConfidence.score ?? 0) <= 3) {
          decision = 'MONITOR';
          notes.push('PURSUE prohibited: evidence confidence too low');
        }
      }
    }
    if (decision === 'PURSUE' && c.evidenceConfidence === 'low') {
      decision = 'MONITOR';
      notes.push('PURSUE prohibited: evidence confidence low');
    }
    if ((decision === 'PURSUE' || decision === 'MONITOR') && !c.falsificationTest) rejection ??= 'no falsifiable next test';
    if (critique.findings.some((f) => f.category === 'unfalsifiable_test' && f.severity !== 'minor')) rejection ??= 'next test judged unfalsifiable';

    // Deterministic duplicate guard: a near-restatement of a tracked thesis is reviewed by the ledger, not re-issued.
    const dup = !c.extendsPositionId && this.trackedTheses.find((t) => jaccard(titleTokens(t.thesis), titleTokens(c.thesis)) >= DUPLICATE_THESIS_THRESHOLD);
    if (dup) c = { ...c, extendsPositionId: dup.id };
    if (c.extendsPositionId) {
      if (trackedPositions.has(c.extendsPositionId)) {
        status = 'routed_to_continuity';
        notes.push(`extends ${c.extendsPositionId}: reviewed by the 012 Continuity Ledger instead of creating a duplicate position`);
      } else notes.push(`extendsPositionId ${c.extendsPositionId} is not a tracked position; ignored`);
    }
    if (rejection) status = 'rejected';

    return {
      id,
      runId: run.id,
      kind: c.kind,
      thesis: c.thesis,
      targetActor: c.targetActor,
      decisionToConsider: c.decisionToConsider,
      whyNow: c.whyNow,
      supportingClaimIds: goodClaims,
      linkedConsequenceIds: c.linkedConsequenceIds.filter((x) => acceptedConsequences.has(x)),
      economicMechanism: c.economicMechanism,
      strongestCounterargument: c.strongestCounterargument,
      alternatives: c.alternatives,
      competitors,
      blocker: c.blocker,
      falsificationTest: c.falsificationTest ?? undefined,
      validationConditions: c.validationConditions,
      invalidationConditions: c.invalidationConditions,
      reviewDate: c.reviewDate && /^\d{4}-\d{2}-\d{2}$/.test(c.reviewDate) ? c.reviewDate : addDays(run.localIssueDate, 30),
      proposedDecision: c.proposedDecision,
      decision,
      decisionGateNotes: notes,
      evidenceConfidence: c.evidenceConfidence,
      extendsPositionId: c.extendsPositionId ?? undefined,
      scorecard,
      critique: { ...critique, id: stableId('critique', id), targetId: id, promptVersion: ADVERSARIAL_REVIEW.version },
      status,
      rejectionReason: rejection,
    };
  }
}
