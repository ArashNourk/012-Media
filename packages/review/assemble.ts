import {
  ENGINE_VERSION,
  PUBLICATION_01,
  type Claim,
  type Consequence,
  type ContinuityProposal,
  type IssueContent,
  type Position,
  type PositionCandidate,
  type Signal,
  type SourceDocument,
} from '../contracts';

export const METHOD_NOTE =
  '00 / SIGNAL: verified developments, each claim checked against the retrieved source. 01 / CONSEQUENCE: explicit causal reasoning with assumptions, alternatives and disconfirming indicators. 02 / POSITION: an editorial judgement with its strongest counterargument and a falsifiable next test. Positions are tracked and revised in dated, append-only updates. Human editorial approval is required before release; it is not a guarantee of truth.';

export interface AssembleInput {
  issueId: string;
  localIssueDate: string;
  editionNumber: number;
  runId: string;
  headline: string;
  lead: string;
  signals: Signal[];
  consequences: Consequence[];
  position: { record: Position; candidate: PositionCandidate; isNew: boolean } | null;
  noPositionStatement?: string;
  continuity: { proposal: ContinuityProposal; position: Position }[];
  claims: Map<string, Claim>;
  sources: Map<string, SourceDocument>;
  editorialNotes: string[];
}

/** Deterministic assembly of the structured edition record from engine outputs. */
export function assembleIssue(i: AssembleInput): IssueContent {
  const usedSourceIds = new Set<string>();
  const signals = i.signals.map((s) => {
    const srcIds = s.sources.filter((id) => i.sources.get(id)?.retrievalStatus === 'ok');
    srcIds.forEach((x) => usedSourceIds.add(x));
    return {
      signalId: s.id,
      headline: s.headline,
      eventAt: s.eventAt,
      summary: s.summary,
      relevance: s.relevance,
      qualifications: s.evidenceQualifications,
      weakSignal: s.weakSignal,
      sourceIds: srcIds,
    };
  });
  const consequences = i.consequences.map((c) => ({
    consequenceId: c.id,
    statement: c.statement,
    mechanism: c.mechanism,
    stakeholders: c.affectedActors,
    alternatives: c.alternatives,
    uncertainty: `${c.evidenceConfidence[0].toUpperCase()}${c.evidenceConfidence.slice(1)} evidence confidence. ${c.confidenceRationale}`,
    horizon: c.horizon,
    disconfirmingIndicators: c.disconfirmingIndicators,
  }));
  let position: IssueContent['position'] = null;
  if (i.position) {
    const { record, candidate, isNew } = i.position;
    const evidence = candidate.supportingClaimIds
      .map((id) => i.claims.get(id))
      .filter((c): c is Claim => !!c)
      .slice(0, 3)
      .map((c) => (c.caveat && /Reported by|Self-reported|Forecast|forward-looking/.test(c.caveat) ? `${c.text} (${c.caveat.split('.')[0].trim()})` : c.text))
      .join(' ');
    for (const id of candidate.supportingClaimIds) {
      const c = i.claims.get(id);
      if (c) usedSourceIds.add(c.provenance[0].sourceId);
    }
    position = {
      positionId: record.id,
      isNew,
      decision: candidate.decision,
      thesis: record.originalThesis,
      targetActor: candidate.targetActor,
      decisionToConsider: candidate.decisionToConsider,
      whyNow: candidate.whyNow,
      evidence,
      counterargument: candidate.strongestCounterargument,
      competitors: candidate.competitors.map((k) => k.name),
      blocker: candidate.critique?.decisiveObstacle || candidate.blocker,
      firstTest: candidate.falsificationTest ?? candidate.critique?.smallestNextTest ?? '',
      changeConditions: candidate.invalidationConditions,
      evidenceConfidence: candidate.evidenceConfidence,
      reviewDate: candidate.reviewDate,
    };
  }
  const continuity = i.continuity.map(({ proposal, position: p }) => {
    const srcIds = [...new Set(proposal.newClaimIds.map((id) => i.claims.get(id)?.provenance[0].sourceId).filter((x): x is string => !!x))];
    srcIds.forEach((x) => usedSourceIds.add(x));
    return {
      positionId: p.id,
      proposalId: proposal.id,
      firstIdentifiedOn: p.firstIdentifiedOn,
      previousStatus: proposal.previousStatus,
      newStatus: proposal.proposedStatus,
      line: proposal.publicLine,
      newSourceIds: srcIds,
      originalReference: p.seeded
        ? `Seeded ledger record created for continuity testing on ${p.firstIdentifiedOn}; not a previously published 012 edition.`
        : `First published in the 01 / AI ECONOMY edition of ${p.firstIdentifiedOn}${p.initialIssueId ? ` (${p.initialIssueId})` : ''}.`,
    };
  });
  const sources = [...usedSourceIds]
    .map((id) => i.sources.get(id))
    .filter((s): s is SourceDocument => !!s)
    .sort((a, b) => (a.publishedAt ?? '').localeCompare(b.publishedAt ?? ''))
    .map((s) => ({ sourceId: s.id, url: s.canonicalUrl, publisher: s.publisher, title: s.title, publishedAt: s.publishedAt, retrievedAt: s.retrievedAt }));

  return {
    issueId: i.issueId,
    publicationId: PUBLICATION_01.id,
    publicationLabel: PUBLICATION_01.label,
    localIssueDate: i.localIssueDate,
    editionNumber: i.editionNumber,
    version: 0,
    headline: i.headline,
    lead: i.lead,
    signals,
    consequences,
    position,
    noPositionStatement: position ? undefined : i.noPositionStatement,
    continuity,
    sources,
    corrections: [],
    editorialNotes: i.editorialNotes,
    methodNote: METHOD_NOTE,
    engineVersion: ENGINE_VERSION,
    runId: i.runId,
  };
}

/** Collect every reader-facing string of an issue (for citation and number checks). */
export function readerFacingText(c: IssueContent): string[] {
  const out = [c.headline, c.lead, ...(c.noPositionStatement ? [c.noPositionStatement] : [])];
  for (const s of c.signals) out.push(s.headline, s.summary, s.relevance, ...s.qualifications);
  for (const k of c.consequences) out.push(k.statement, k.mechanism, k.uncertainty, ...k.alternatives, ...k.disconfirmingIndicators);
  if (c.position) {
    const p = c.position;
    out.push(p.thesis, p.targetActor, p.decisionToConsider, p.whyNow, p.evidence, p.counterargument, p.blocker, p.firstTest, ...p.changeConditions);
  }
  for (const k of c.continuity) out.push(k.line);
  for (const k of c.corrections) out.push(k.text);
  return out;
}
