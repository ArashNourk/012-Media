import {
  canTransitionLedger,
  newId,
  stableId,
  type Claim,
  type Consequence,
  type ContinuityProposal,
  type Position,
  type Revision,
  type Signal,
} from '../../contracts';
import { jaccard, titleTokens } from '../../connectors/http/similarity';
import type { Repository, RunRecord } from '../../persistence/repository';
import type { EngineContext } from '../context';
import { untracedNumbers } from '../shared/numbers';
import { ASSESS_CONTINUITY } from './tasks';

export const SEMANTIC_SUGGESTION_THRESHOLD = 0.12;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export function conditionLabels(p: Position) {
  return {
    validation: p.validationConditions.map((text, i) => ({ label: `V${i + 1}`, text })),
    invalidation: p.invalidationConditions.map((text, i) => ({ label: `I${i + 1}`, text })),
  };
}

/** Claims already attached to a position (original support, prior revisions, adjacent links). */
function knownClaimIds(repo: Repository, p: Position): Set<string> {
  const ids = new Set(p.supportingClaimIds);
  for (const r of repo.listRevisions(p.id)) r.triggerClaimIds.forEach((x) => ids.add(x));
  for (const l of repo.listEvidenceLinks(p.id)) ids.add(String(l.claim_id));
  return ids;
}

export interface MatchResult {
  position: Position;
  matchedBy: ContinuityProposal['matchedBy'];
  matchDetail: string;
  signalIds: string[];
}

/**
 * Entity/event matching. Exact entity and topic relationships establish a
 * candidate; semantic similarity may only *suggest* one, flagged as such, and
 * never on its own establishes that a position has changed.
 */
export function matchPositions(positions: Position[], signals: Signal[], consequences: Consequence[]): MatchResult[] {
  const out: MatchResult[] = [];
  for (const p of positions) {
    const ents = new Set(p.entities.map(norm));
    const tags = new Set(p.topicTags.map(norm));
    const matchedBy = new Set<ContinuityProposal['matchedBy'][number]>();
    const sigIds = new Set<string>();
    const detail: string[] = [];
    for (const s of signals) {
      const se = s.entities.map(norm).filter((e) => ents.has(e));
      const st = s.topicTags.map(norm).filter((t) => tags.has(t));
      if (se.length) {
        matchedBy.add('entity');
        sigIds.add(s.id);
        detail.push(`${s.id}: shared entities ${se.join(', ')}`);
      }
      if (st.length) {
        matchedBy.add('topic');
        sigIds.add(s.id);
        detail.push(`${s.id}: shared topics ${st.join(', ')}`);
      }
      if (!se.length && !st.length) {
        const sim = jaccard(titleTokens(p.originalThesis), titleTokens(`${s.headline} ${s.summary}`));
        if (sim >= SEMANTIC_SUGGESTION_THRESHOLD) {
          matchedBy.add('semantic_suggestion');
          sigIds.add(s.id);
          detail.push(`${s.id}: lexical similarity ${sim.toFixed(2)} (suggestion only)`);
        }
      }
    }
    for (const c of consequences)
      for (const l of c.continuityLinks)
        if (l.positionId === p.id && l.effect !== 'no_effect') {
          c.linkedSignalIds.forEach((x) => sigIds.add(x));
          detail.push(`${c.id} ${l.effect} this position`);
        }
    if (sigIds.size) out.push({ position: p, matchedBy: [...matchedBy].length ? [...matchedBy] : ['semantic_suggestion'], matchDetail: detail.join('; '), signalIds: [...sigIds] });
  }
  return out;
}

/**
 * 012 Continuity Ledger — cross-edition memory.
 * Workflow: entity/event matching → retrieve prior positions → evaluate
 * genuinely new evidence → compare old and new thesis → propose status
 * transition → (editor ratification at approval) → append revision.
 */
export class ContinuityLedger {
  constructor(private ctx: EngineContext) {}

  async reviewNewEvidence(run: RunRecord, signals: Signal[], consequences: Consequence[], claims: Claim[]): Promise<ContinuityProposal[]> {
    const { repo, runner } = this.ctx;
    const positions = repo.listLedgerPositions(run.publicationId);
    const matches = matchPositions(positions, signals.filter((s) => s.editorialStatus === 'accepted'), consequences.filter((c) => c.status === 'accepted'));
    if (!matches.length) return [];
    const claimMap = new Map(claims.map((c) => [c.id, c]));
    const sources = new Map(repo.listRunSources(run.id).map((s) => [s.id, s]));

    const work = matches
      .map((m) => {
        const known = knownClaimIds(repo, m.position);
        const revs = repo.listRevisions(m.position.id);
        const lastReview = revs.length ? revs[revs.length - 1].recordedAt.slice(0, 10) : m.position.firstIdentifiedOn;
        const newClaims = m.signalIds
          .flatMap((sid) => signals.find((s) => s.id === sid)?.claimIds ?? [])
          .map((id) => claimMap.get(id))
          .filter((c): c is Claim => !!c && (c.support === 'supported' || c.support === 'qualified') && !known.has(c.id))
          // genuinely new: published after the position's latest review
          .filter((c) => (c.provenance[0].publishedAt ?? '').slice(0, 10) > lastReview);
        return { m, newClaims, revs };
      })
      .filter((w) => w.newClaims.length);
    if (!work.length) return [];

    const results = await runner.runAll(
      ASSESS_CONTINUITY,
      work.map(({ m, newClaims, revs }) => {
        const labels = conditionLabels(m.position);
        const last = revs[revs.length - 1];
        return {
          position: {
            positionId: m.position.id,
            firstIdentifiedOn: m.position.firstIdentifiedOn,
            originalThesis: m.position.originalThesis,
            decision: m.position.decision,
            currentStatus: m.position.currentStatus,
            latestRevision: last ? `${last.recordedAt.slice(0, 10)} ${last.previousStatus}→${last.newStatus}: ${last.rationale}` : null,
            validationConditions: labels.validation,
            invalidationConditions: labels.invalidation,
          },
          newClaims: newClaims.map((c) => ({
            claimId: c.id,
            text: c.text,
            type: c.type,
            eventState: c.eventState,
            support: c.support,
            caveat: c.caveat,
            publishedAt: c.provenance[0].publishedAt,
            publisher: sources.get(c.provenance[0].sourceId)?.publisher ?? c.provenance[0].publisher,
          })),
        };
      }),
      run.id,
    );

    const proposals = work.map(({ m, newClaims }, i) => gateProposal(run, m, newClaims, results[i].output));
    for (const p of proposals) {
      repo.saveProposal(p);
      if (p.status === 'linked_only')
        for (const id of p.newClaimIds) repo.linkEvidence(p.positionId, id, run.id, 'adjacent', p.whyThisAltersJudgment);
    }
    repo.audit('continuity', 'review.completed', run.id, proposals.map((p) => ({ id: p.id, positionId: p.positionId, effect: p.effect, status: p.status })));
    return proposals;
  }

  ratify(proposal: ContinuityProposal, approvalId: string, issueId: string): Revision {
    return ratifyProposal(this.ctx.repo, proposal, approvalId, issueId);
  }
}

/**
 * Editor ratification: append-only revision linked to the approval record,
 * the issue and the exact new claims. Never modifies the original thesis.
 */
export function ratifyProposal(repo: Repository, proposal: ContinuityProposal, approvalId: string, issueId: string): Revision {
  if (proposal.status !== 'proposed' || !proposal.gate.passed || proposal.effect !== 'material_change')
    throw new Error(`proposal ${proposal.id} is not a ratifiable material change`);
  if (!proposal.newClaimIds.length) throw new Error('a revision requires new supporting evidence');
  const rev: Revision = {
    id: newId('revision'),
    positionId: proposal.positionId,
    previousStatus: proposal.previousStatus,
    newStatus: proposal.proposedStatus,
    triggerClaimIds: proposal.newClaimIds,
    recordedAt: repo.now(),
    issueId,
    rationale: proposal.whyThisAltersJudgment,
    editorApprovalId: approvalId,
    publicLine: proposal.publicLine,
    proposalId: proposal.id,
  };
  repo.transaction(() => {
    repo.appendRevision(rev);
    repo.setProposalStatus(proposal.id, 'ratified');
    for (const id of proposal.newClaimIds) repo.linkEvidence(proposal.positionId, id, proposal.runId, 'revision_trigger', rev.id);
  });
  return rev;
}

export function gateProposal(
  run: RunRecord,
  m: MatchResult,
  newClaims: Claim[],
  o: { effect: ContinuityProposal['effect']; proposedStatus: ContinuityProposal['proposedStatus']; whyThisAltersJudgment: string; conditionRefs: string[]; citedClaimIds: string[]; publicLine: string },
): ContinuityProposal {
  const p = m.position;
  const reasons: string[] = [];
  const allowed = new Set(newClaims.map((c) => c.id));
  const cited = o.citedClaimIds.filter((id) => allowed.has(id));
  const foreign = o.citedClaimIds.filter((id) => !allowed.has(id));
  if (foreign.length) reasons.push(`cites claims that are not new verified evidence: ${foreign.join(', ')}`);
  const labels = conditionLabels(p);
  const vLabels = new Set(labels.validation.map((x) => x.label));
  const iLabels = new Set(labels.invalidation.map((x) => x.label));
  const badRefs = o.conditionRefs.filter((r) => !vLabels.has(r) && !iLabels.has(r));
  if (badRefs.length) reasons.push(`unknown condition references: ${badRefs.join(', ')}`);

  if (o.effect === 'material_change') {
    if (!cited.length) reasons.push('status change without cited new supporting evidence');
    if (o.proposedStatus === p.currentStatus) reasons.push('material change proposed without a status change');
    else if (!canTransitionLedger(p.currentStatus, o.proposedStatus)) reasons.push(`ledger transition ${p.currentStatus} → ${o.proposedStatus} not allowed`);
    if (o.proposedStatus === 'VALIDATED' && !o.conditionRefs.some((r) => vLabels.has(r))) reasons.push('VALIDATED requires a prespecified validation condition');
    if (o.proposedStatus === 'INVALIDATED' && !o.conditionRefs.some((r) => iLabels.has(r))) reasons.push('INVALIDATED requires a prespecified invalidation condition');
    if (!o.whyThisAltersJudgment.trim()) reasons.push('missing explicit reason why this alters the judgement');
    const untraced = untracedNumbers(o.publicLine, cited.map((id) => newClaims.find((c) => c.id === id)!.text));
    if (untraced.length) reasons.push(`continuity line has numbers not traceable to cited claims: ${untraced.join(', ')}`);
  } else if (o.proposedStatus !== p.currentStatus) {
    reasons.push(`${o.effect} evidence cannot change status`);
  }
  const passed = reasons.length === 0;
  const status: ContinuityProposal['status'] = !passed ? 'rejected' : o.effect === 'material_change' ? 'proposed' : o.effect === 'adjacent' ? 'linked_only' : 'rejected';
  return {
    id: stableId('continuityProposal', run.id, p.id),
    runId: run.id,
    positionId: p.id,
    matchedBy: m.matchedBy,
    matchDetail: m.matchDetail,
    newClaimIds: o.effect === 'no_effect' ? [] : cited,
    effect: o.effect,
    previousStatus: p.currentStatus,
    proposedStatus: passed ? o.proposedStatus : p.currentStatus,
    whyThisAltersJudgment: o.whyThisAltersJudgment,
    conditionRefs: o.conditionRefs,
    publicLine: o.publicLine,
    gate: { passed, reasons },
    status,
  };
}
