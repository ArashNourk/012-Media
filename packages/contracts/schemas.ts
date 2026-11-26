import { z } from 'zod';

/*
 * Logical contracts of the 012 Intelligence Engine (Architecture v1.0 §4).
 * These schemas are the single definition used by every engine, the
 * persistence layer, the editorial review and the 012 Publishing Engine.
 */

export const IsoDateTime = z.string().datetime({ offset: true });
export const LocalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

// ---------------------------------------------------------------- sources

export const RetrievalStatus = z.enum([
  'ok',
  'http_error',
  'network_error',
  'not_article', // resolved, but to an index/listing page rather than an article
  'unsupported_content',
]);
export type RetrievalStatus = z.infer<typeof RetrievalStatus>;

export const SourceOrigin = z.enum(['primary', 'secondary']);

export const SourceDocument = z.object({
  id: z.string(),
  requestedUrl: z.string().url(),
  finalUrl: z.string().url(),
  canonicalUrl: z.string().url(),
  httpStatus: z.number().int(),
  contentType: z.string(),
  publisher: z.string(),
  publisherDomain: z.string(),
  origin: SourceOrigin,
  title: z.string(),
  articleType: z.string(), // og:type / JSON-LD type, e.g. "article"
  publishedAt: IsoDateTime.optional(),
  retrievedAt: IsoDateTime,
  retrievalStatus: RetrievalStatus,
  retrievalNote: z.string().optional(),
  contentSha256: z.string(),
  textLength: z.number().int(),
  /** Near-duplicate fingerprint (MinHash-like sorted shingle hashes). */
  shingleFingerprint: z.array(z.number()),
  rights: z.object({
    excerptMaxChars: z.number().int(),
    note: z.string(),
  }),
});
export type SourceDocument = z.infer<typeof SourceDocument>;

// ---------------------------------------------------------------- claims

export const ClaimType = z.enum(['observed', 'reported_claim', 'inference', 'hypothesis', 'forecast']);
export type ClaimType = z.infer<typeof ClaimType>;

/**
 * Event state qualification: an announcement is not a shipment; a proposal is
 * not an enacted rule. Every claim states which stage it asserts.
 */
export const EventState = z.enum([
  'proposed',
  'planned',
  'expected',
  'announced',
  'approved',
  'purchased',
  'shipped',
  'installed',
  'operational',
  'completed',
  'not_applicable',
]);
export type EventState = z.infer<typeof EventState>;

export const Quantity = z.object({
  value: z.string(), // as written in the claim, e.g. "93.5", "1,127,000,000"
  unit: z.string(), // e.g. "USD billion", "shares", "percent"
});
export type Quantity = z.infer<typeof Quantity>;

export const Provenance = z.object({
  sourceId: z.string(),
  canonicalUrl: z.string().url(), // opened and validated
  publisher: z.string(),
  publishedAt: IsoDateTime.optional(),
  eventAt: z.string().optional(),
  retrievedAt: IsoDateTime,
  locator: z.string(), // section, paragraph or document reference
  excerpt: z.string().optional(), // brief and rights-compliant
});
export type Provenance = z.infer<typeof Provenance>;

export const ClaimSupport = z.enum(['supported', 'qualified', 'contradicted', 'unverified']);
export type ClaimSupport = z.infer<typeof ClaimSupport>;

export const VerificationCheck = z.object({
  name: z.string(),
  passed: z.boolean(),
  detail: z.string(),
});
export type VerificationCheck = z.infer<typeof VerificationCheck>;

export const Claim = z.object({
  id: z.string(),
  runId: z.string(),
  clusterId: z.string().optional(),
  text: z.string(),
  type: ClaimType,
  eventState: EventState,
  entities: z.array(z.string()),
  quantities: z.array(Quantity),
  material: z.boolean(),
  provenance: z.array(Provenance).min(1),
  support: ClaimSupport,
  caveat: z.string().optional(),
  verification: z.object({
    verifierVersion: z.string(),
    verifiedAt: IsoDateTime,
    checks: z.array(VerificationCheck),
    supersededByClaimId: z.string().optional(),
    contradictsClaimIds: z.array(z.string()).default([]),
  }),
});
export type Claim = z.infer<typeof Claim>;

// ---------------------------------------------------------------- events & signals

export const EventCluster = z.object({
  id: z.string(),
  runId: z.string(),
  title: z.string(),
  sourceIds: z.array(z.string()).min(1),
  /** Groups of sourceIds that are near-duplicate rewrites of one another. */
  syndicationGroups: z.array(z.array(z.string())),
  independentSourceCount: z.number().int(),
  publisherDomains: z.array(z.string()),
  earliestPublishedAt: IsoDateTime.optional(),
  latestPublishedAt: IsoDateTime.optional(),
});
export type EventCluster = z.infer<typeof EventCluster>;

export const FactorScore = z.object({
  score: z.number().int().min(0).max(5),
  rationale: z.string().min(1),
});

export const SignalFactors = z.object({
  materiality: FactorScore,
  decisionRelevance: FactorScore,
  novelty: FactorScore,
  causalReach: FactorScore,
  sourceReliability: FactorScore,
});
export type SignalFactors = z.infer<typeof SignalFactors>;

export const SignalStatus = z.enum(['candidate', 'review', 'accepted', 'rejected']);

export const Signal = z.object({
  id: z.string(),
  runId: z.string(),
  eventClusterId: z.string(),
  headline: z.string(),
  eventAt: z.string().optional(),
  topicTags: z.array(z.string()),
  entities: z.array(z.string()),
  claimIds: z.array(z.string()),
  sources: z.array(z.string()),
  weakSignal: z.boolean(),
  weakSignalRationale: z.string().optional(),
  selectionRationale: z.string(),
  editorialStatus: SignalStatus,
  factors: SignalFactors,
  candidatePriority: z.number(),
  summary: z.string(),
  relevance: z.string(),
  evidenceQualifications: z.array(z.string()),
  gate: z.object({
    passed: z.boolean(),
    blockingClaimIds: z.array(z.string()),
    reasons: z.array(z.string()),
  }),
  rejectionReason: z.string().optional(),
});
export type Signal = z.infer<typeof Signal>;

// ---------------------------------------------------------------- consequences

export const Horizon = z.enum(['near', 'medium', 'long', 'unknown']);
export const Confidence = z.enum(['low', 'medium', 'high']);

export const ContinuityLink = z.object({
  positionId: z.string(),
  effect: z.enum(['supports', 'weakens', 'no_effect']),
  rationale: z.string(),
});

export const Consequence = z.object({
  id: z.string(),
  runId: z.string(),
  linkedSignalIds: z.array(z.string()).min(1),
  statement: z.string(),
  mechanism: z.string(), // explicit because-chain
  causalChain: z.array(z.string()).min(2),
  affectedActors: z.array(z.string()).min(1),
  assumptions: z.array(z.string()).min(1),
  alternatives: z.array(z.string()).min(1),
  disconfirmingIndicators: z.array(z.string()).min(1),
  baseline: z.string(),
  constraints: z.array(z.string()),
  firstOrderEffects: z.array(z.string()),
  secondOrderEffects: z.array(z.string()),
  observedClaimIds: z.array(z.string()).min(1),
  inferenceNote: z.string(),
  horizon: Horizon,
  evidenceConfidence: Confidence,
  confidenceRationale: z.string(),
  continuityLinks: z.array(ContinuityLink),
  challenge: z
    .object({
      verdict: z.enum(['pass', 'revise', 'hold']),
      neutralHeadlineTest: z.string(),
      findings: z.array(z.string()),
    })
    .optional(),
  status: z.enum(['candidate', 'accepted', 'held']),
  holdReason: z.string().optional(),
});
export type Consequence = z.infer<typeof Consequence>;

// ---------------------------------------------------------------- positions

export const PositionDecision = z.enum(['PURSUE', 'MONITOR', 'DISMISS', 'NO_MATERIAL_POSITION']);
export type PositionDecision = z.infer<typeof PositionDecision>;

export const PositionKind = z.enum(['market_opportunity', 'risk', 'operational_implication', 'no_action']);

export const LedgerStatus = z.enum([
  'EMERGING',
  'STRENGTHENING',
  'STABLE',
  'WEAKENING',
  'VALIDATED',
  'INVALIDATED',
  'UNRESOLVED',
  'RETIRED',
]);
export type LedgerStatus = z.infer<typeof LedgerStatus>;

export const RUBRIC_DIMENSIONS = [
  'executionFit',
  'marketAttractiveness',
  'marketSaturation',
  'customerUrgency',
  'monetization',
  'reachableMarketGrowth',
  'differentiation',
  'distributionFeasibility',
  'mvpFeasibility',
  'capitalEfficiency',
  'scalability',
  'timing',
  'executionRegulatoryRisk',
  'evidenceConfidence',
] as const;
export type RubricDimension = (typeof RUBRIC_DIMENSIONS)[number];

export const DimensionScore = z.object({
  score: z.number().int().min(0).max(10).nullable(), // null = not assessable
  rationale: z.string().min(1),
  unknown: z.boolean(),
});

export const Scorecard = z.object({
  id: z.string(),
  candidateId: z.string(),
  operatorArchetype: z.string().nullable(), // never an invisible personal profile
  dimensions: z.object(Object.fromEntries(RUBRIC_DIMENSIONS.map((d) => [d, DimensionScore])) as {
    [K in RubricDimension]: typeof DimensionScore;
  }),
  priority: z.number().nullable(),
  unscoredWeightedDimensions: z.array(z.string()),
  cautionFlags: z.array(z.string()),
});
export type Scorecard = z.infer<typeof Scorecard>;

export const Competitor = z.object({
  name: z.string(),
  relevance: z.string(),
  claimIds: z.array(z.string()), // a named competitor must be evidenced
});

export const CritiqueCategory = z.enum([
  'overstated_novelty',
  'weak_demand_evidence',
  'absent_competitor_knowledge',
  'implausible_differentiation',
  'compliance_or_employer_overlap',
  'unfalsifiable_test',
  'causal_leap',
  'unsupported_fact',
  'other',
]);

export const Critique = z.object({
  id: z.string(),
  targetId: z.string(),
  promptVersion: z.string(),
  findings: z.array(
    z.object({
      category: CritiqueCategory,
      severity: z.enum(['blocking', 'major', 'minor']),
      detail: z.string(),
    }),
  ),
  verdict: z.enum(['pass', 'revise', 'block']),
  decisiveObstacle: z.string(),
  smallestNextTest: z.string(),
});
export type Critique = z.infer<typeof Critique>;

export const PositionCandidate = z.object({
  id: z.string(),
  runId: z.string(),
  kind: PositionKind,
  thesis: z.string(),
  targetActor: z.string(),
  decisionToConsider: z.string(),
  whyNow: z.string(),
  supportingClaimIds: z.array(z.string()),
  linkedConsequenceIds: z.array(z.string()),
  economicMechanism: z.string(),
  strongestCounterargument: z.string(),
  alternatives: z.array(z.string()),
  competitors: z.array(Competitor),
  blocker: z.string(),
  falsificationTest: z.string().optional(),
  validationConditions: z.array(z.string()),
  invalidationConditions: z.array(z.string()),
  reviewDate: LocalDate.optional(),
  proposedDecision: PositionDecision,
  decision: PositionDecision, // after gates
  decisionGateNotes: z.array(z.string()),
  evidenceConfidence: Confidence,
  extendsPositionId: z.string().optional(),
  scorecard: Scorecard.optional(),
  critique: Critique.optional(),
  status: z.enum(['candidate', 'selected', 'rejected', 'routed_to_continuity']),
  rejectionReason: z.string().optional(),
});
export type PositionCandidate = z.infer<typeof PositionCandidate>;

export const Position = z.object({
  id: z.string(), // permanent e.g. POS-000042
  publicationId: z.string(),
  originalThesis: z.string(), // immutable after first publication
  linkedConsequenceIds: z.array(z.string()),
  decision: PositionDecision,
  rationale: z.string(),
  alternatives: z.array(z.string()),
  blocker: z.string(),
  falsificationTest: z.string().optional(),
  reviewDate: LocalDate.optional(),
  scorecardId: z.string().optional(),
  // ledger fields
  targetActor: z.string(),
  decisionToConsider: z.string(),
  entities: z.array(z.string()),
  topicTags: z.array(z.string()),
  supportingClaimIds: z.array(z.string()),
  validationConditions: z.array(z.string()),
  invalidationConditions: z.array(z.string()),
  initialStatus: LedgerStatus,
  currentStatus: LedgerStatus,
  firstIdentifiedOn: LocalDate,
  initialIssueId: z.string().optional(),
  candidateId: z.string().optional(),
  seeded: z.boolean(),
  seedNote: z.string().optional(),
  createdAt: IsoDateTime,
});
export type Position = z.infer<typeof Position>;

export const Revision = z.object({
  id: z.string(),
  positionId: z.string(),
  previousStatus: z.string(),
  newStatus: z.string(),
  triggerClaimIds: z.array(z.string()).min(1),
  recordedAt: IsoDateTime,
  issueId: z.string().optional(),
  rationale: z.string(),
  editorApprovalId: z.string(),
  publicLine: z.string(),
  proposalId: z.string(),
});
export type Revision = z.infer<typeof Revision>;

export const ContinuityProposal = z.object({
  id: z.string(),
  runId: z.string(),
  positionId: z.string(),
  matchedBy: z.array(z.enum(['entity', 'topic', 'semantic_suggestion'])),
  matchDetail: z.string(),
  newClaimIds: z.array(z.string()),
  effect: z.enum(['material_change', 'adjacent', 'no_effect']),
  previousStatus: LedgerStatus,
  proposedStatus: LedgerStatus,
  whyThisAltersJudgment: z.string(),
  conditionRefs: z.array(z.string()),
  publicLine: z.string(),
  gate: z.object({ passed: z.boolean(), reasons: z.array(z.string()) }),
  status: z.enum(['proposed', 'linked_only', 'rejected', 'ratified']),
});
export type ContinuityProposal = z.infer<typeof ContinuityProposal>;

// ---------------------------------------------------------------- issue (editorial record)

export const IssueSignalEntry = z.object({
  signalId: z.string(),
  headline: z.string(),
  eventAt: z.string().optional(),
  summary: z.string(),
  relevance: z.string(),
  qualifications: z.array(z.string()),
  weakSignal: z.boolean(),
  sourceIds: z.array(z.string()).min(1),
});

export const IssueConsequenceEntry = z.object({
  consequenceId: z.string(),
  statement: z.string(),
  mechanism: z.string(),
  stakeholders: z.array(z.string()),
  alternatives: z.array(z.string()),
  uncertainty: z.string(),
  horizon: Horizon,
  disconfirmingIndicators: z.array(z.string()),
});

export const IssuePositionEntry = z.object({
  positionId: z.string(),
  isNew: z.boolean(),
  decision: PositionDecision,
  thesis: z.string(),
  targetActor: z.string(),
  decisionToConsider: z.string(),
  whyNow: z.string(),
  evidence: z.string(),
  counterargument: z.string(),
  competitors: z.array(z.string()),
  blocker: z.string(),
  firstTest: z.string(),
  changeConditions: z.array(z.string()),
  evidenceConfidence: Confidence,
  reviewDate: LocalDate.optional(),
});

export const IssueContinuityEntry = z.object({
  positionId: z.string(),
  proposalId: z.string(),
  firstIdentifiedOn: LocalDate,
  previousStatus: LedgerStatus,
  newStatus: LedgerStatus,
  line: z.string(),
  newSourceIds: z.array(z.string()).min(1),
  originalReference: z.string(),
});

export const IssueSourceEntry = z.object({
  sourceId: z.string(),
  url: z.string().url(),
  publisher: z.string(),
  title: z.string(),
  publishedAt: IsoDateTime.optional(),
  retrievedAt: IsoDateTime,
});

export const IssueContent = z.object({
  issueId: z.string(),
  publicationId: z.string(),
  publicationLabel: z.string(),
  localIssueDate: LocalDate,
  editionNumber: z.number().int(),
  version: z.number().int(),
  headline: z.string(),
  lead: z.string(),
  signals: z.array(IssueSignalEntry),
  consequences: z.array(IssueConsequenceEntry),
  position: IssuePositionEntry.nullable(),
  noPositionStatement: z.string().optional(),
  continuity: z.array(IssueContinuityEntry),
  sources: z.array(IssueSourceEntry).min(1),
  corrections: z.array(z.object({ date: LocalDate, text: z.string() })),
  editorialNotes: z.array(z.string()), // disclosed limitations (e.g. single-publisher source base)
  methodNote: z.string(),
  engineVersion: z.string(),
  runId: z.string(),
});
export type IssueContent = z.infer<typeof IssueContent>;
