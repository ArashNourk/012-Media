import { z } from 'zod';
import { ClaimType, EventState, Quantity } from '../../contracts';
import type { LlmTask } from '../../connectors/llm/types';
import { EVIDENCE_POLICY } from '../context';

// ------------------------------------------------------------ extractAtomicClaims

export const ExtractedClaim = z.object({
  text: z.string().describe('One atomic, falsifiable statement, paraphrased (not copied) from the source.'),
  type: ClaimType,
  eventState: EventState,
  entities: z.array(z.string()).describe('Organisations, products, agencies or people the claim is about, as named in the source.'),
  quantities: z.array(Quantity).describe('Every number in `text`, exactly as written in the source, with unit.'),
  excerpt: z.string().describe('Verbatim supporting passage copied exactly from the source text, 20–300 characters.'),
  locator: z.string().describe('Where in the document, e.g. "para 2" or "section: Meeting government security requirements".'),
  material: z.boolean().describe('True if the claim would matter to a decision-maker reading the brief.'),
  eventAt: z.string().nullable().describe('YYYY-MM-DD of the event itself if the source states it, else null.'),
  attribution: z.string().nullable().describe('Who asserts this, when it is a reported claim or self-reported figure; else null.'),
});
export type ExtractedClaim = z.infer<typeof ExtractedClaim>;

export const ExtractClaimsOutput = z.object({
  claims: z.array(ExtractedClaim),
  documentNote: z.string().describe('One sentence on what kind of document this is (e.g. company press release, policy statement).'),
});

export interface ExtractClaimsInput {
  sourceId: string;
  url: string;
  publisher: string;
  title: string;
  publishedAt?: string;
  text: string;
}

export const EXTRACT_CLAIMS: LlmTask<ExtractClaimsInput, z.infer<typeof ExtractClaimsOutput>> = {
  name: 'signal.extract_claims',
  version: 'v1.0.0',
  system: `${EVIDENCE_POLICY}

Task (012 Signal Engine — isolation): split the document into atomic factual claims.
- Extract the material claims (usually 4–12). Skip boilerplate, legal disclaimers, navigation and contact details.
- Each claim states one thing. Preserve quantities and units exactly as written.
- type: "observed" for what the publisher states happened or exists; "reported_claim" for an assertion attributed to someone (including a company's own performance/usage figures and quotes); "forecast" for expectations/estimates; "hypothesis"/"inference" are not normally used at extraction.
- eventState: the stage the claim asserts (announced, approved, completed, expected, …). Use not_applicable for descriptive facts.
- excerpt: copy the supporting passage character-for-character from the source text. It is checked automatically; an excerpt that does not appear in the text fails verification.`,
  render: (i) =>
    `<document sourceId="${i.sourceId}" publisher="${i.publisher}" url="${i.url}" publishedAt="${i.publishedAt ?? 'unknown'}">
<title>${i.title}</title>
<text>
${i.text}
</text>
</document>`,
  output: ExtractClaimsOutput,
  maxTokens: 16000,
  effort: 'high',
};

// ------------------------------------------------------------ verifyClaims (semantic support pass)

export const VerifySupportOutput = z.object({
  judgements: z.array(
    z.object({
      claimKey: z.string(),
      verdict: z.enum(['entails', 'partially_entails', 'does_not_entail']),
      note: z.string(),
    }),
  ),
});

export interface VerifySupportInput {
  sourceId: string;
  claims: { claimKey: string; text: string; type: string; eventState: string; excerpt: string }[];
}

export const VERIFY_SUPPORT: LlmTask<VerifySupportInput, z.infer<typeof VerifySupportOutput>> = {
  name: 'signal.verify_support',
  version: 'v1.0.0',
  system: `${EVIDENCE_POLICY}

Task (012 Signal Engine — verification): for each claim, judge ONLY whether the quoted excerpt, read on its own, supports the claim as worded.
- "entails": the excerpt states the claim, including its numbers, its event stage and its attribution.
- "partially_entails": the excerpt supports part of the claim, or the claim overstates certainty, stage or scope.
- "does_not_entail": the excerpt does not support the claim.
Be strict about stage words (announced vs completed, expected vs actual) and about who is asserting a figure.`,
  render: (i) =>
    `<claims sourceId="${i.sourceId}">
${i.claims
  .map(
    (c) => `<claim key="${c.claimKey}" type="${c.type}" eventState="${c.eventState}">
  <text>${c.text}</text>
  <excerpt>${c.excerpt}</excerpt>
</claim>`,
  )
  .join('\n')}
</claims>`,
  output: VerifySupportOutput,
  maxTokens: 8000,
  effort: 'medium',
};

// ------------------------------------------------------------ prioritizeCandidates (factor scoring)

const Factor = z.object({ score: z.number().int().min(0).max(5), rationale: z.string() });

export const ScoreClusterOutput = z.object({
  headline: z.string().describe('Neutral factual headline, no hype.'),
  eventAt: z.string().nullable().describe('YYYY-MM-DD of the underlying event, from the claims; null if unknown.'),
  topicTags: z.array(z.string()).describe('1–3 of: models, agents, enterprise, compute, semiconductors, data-centers, energy, research, regulation, capital, public-sector, economics'),
  entities: z.array(z.string()),
  factors: z.object({
    materiality: Factor,
    decisionRelevance: Factor,
    novelty: Factor,
    causalReach: Factor,
    sourceReliability: Factor,
  }),
  weakSignal: z.boolean(),
  weakSignalRationale: z.string().nullable(),
  summary: z.string().describe('2–3 sentence factual summary using only the listed claims.'),
  relevance: z.string().describe('One or two sentences: why this matters to decision-makers. Mark inference as such.'),
  evidenceQualifications: z.array(z.string()),
  selectionRationale: z.string(),
  claimIdsUsed: z.array(z.string()),
  criticalClaimIds: z.array(z.string()).describe('Claims the signal cannot stand without.'),
});
export type ScoreClusterOutput = z.infer<typeof ScoreClusterOutput>;

export interface ScoreClusterInput {
  cluster: {
    id: string;
    title: string;
    independentSourceCount: number;
    sources: { sourceId: string; title: string; publisher: string; publishedAt?: string; origin: string }[];
  };
  claims: { claimId: string; text: string; type: string; eventState: string; support: string; caveat?: string; material: boolean }[];
  priorCoverage: { signalId: string; headline: string; eventAt?: string }[];
  trackedPositions: { positionId: string; thesis: string }[];
  editorialTerritory: string;
}

export const SCORE_CLUSTER: LlmTask<ScoreClusterInput, ScoreClusterOutput> = {
  name: 'signal.score_cluster',
  version: 'v1.0.0',
  system: `${EVIDENCE_POLICY}

Task (012 Signal Engine — prioritisation): assess one event cluster for the publication "01 / AI ECONOMY".
Score each factor 0–5 with a one-sentence rationale grounded in the listed claims:
- materiality: size of the change in money, capacity, adoption or rules.
- decisionRelevance: would founders, investors or enterprise strategy leaders act differently?
- novelty: new versus the prior coverage listed (do not award novelty because you have not heard of something).
- causalReach: how many other actors/markets it plausibly affects.
- sourceReliability: primary documents and independent corroboration score higher; self-reported figures without corroboration score lower.
weakSignal = true only when a low-visibility observation plausibly precedes meaningful change AND you can state the causal rationale. Low coverage is not evidence of importance.
Only use claims with support "supported" or "qualified". Do not restate unverified claims as facts.
These scores are editorial heuristics, not measurements.`,
  render: (i) =>
    `<editorialTerritory>${i.editorialTerritory}</editorialTerritory>
<cluster id="${i.cluster.id}" independentSources="${i.cluster.independentSourceCount}">
<title>${i.cluster.title}</title>
${i.cluster.sources.map((s) => `<source id="${s.sourceId}" publisher="${s.publisher}" origin="${s.origin}" publishedAt="${s.publishedAt ?? 'unknown'}">${s.title}</source>`).join('\n')}
</cluster>
<claims>
${i.claims.map((c) => `<claim id="${c.claimId}" type="${c.type}" eventState="${c.eventState}" support="${c.support}" material="${c.material}">${c.text}${c.caveat ? ` [caveat: ${c.caveat}]` : ''}</claim>`).join('\n')}
</claims>
<priorCoverage>
${i.priorCoverage.map((p) => `<signal id="${p.signalId}" eventAt="${p.eventAt ?? ''}">${p.headline}</signal>`).join('\n') || 'none'}
</priorCoverage>
<trackedPositions>
${i.trackedPositions.map((p) => `<position id="${p.positionId}">${p.thesis}</position>`).join('\n') || 'none'}
</trackedPositions>`,
  output: ScoreClusterOutput,
  maxTokens: 8000,
  effort: 'high',
};
