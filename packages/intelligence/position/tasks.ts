import { z } from 'zod';
import { RUBRIC_DIMENSIONS } from '../../contracts';
import type { LlmTask } from '../../connectors/llm/types';
import { EVIDENCE_POLICY } from '../context';

const Dim = z.object({ score: z.number().int().min(0).max(10).nullable(), rationale: z.string(), unknown: z.boolean() });

export const RubricOutput = z.object({
  operatorArchetype: z.string().nullable().describe('Named operator archetype the execution-fit score refers to, or null to omit fit.'),
  dimensions: z.object(Object.fromEntries(RUBRIC_DIMENSIONS.map((d) => [d, Dim])) as { [K in (typeof RUBRIC_DIMENSIONS)[number]]: typeof Dim }),
});

export const CandidateOutput = z.object({
  kind: z.enum(['market_opportunity', 'risk', 'operational_implication', 'no_action']),
  thesis: z.string(),
  targetActor: z.string(),
  decisionToConsider: z.string(),
  whyNow: z.string(),
  supportingClaimIds: z.array(z.string()),
  linkedConsequenceIds: z.array(z.string()),
  economicMechanism: z.string(),
  strongestCounterargument: z.string(),
  alternatives: z.array(z.string()),
  competitors: z.array(z.object({ name: z.string(), relevance: z.string(), claimIds: z.array(z.string()) })).describe('Only competitors named in the supplied claims, with those claim IDs.'),
  blocker: z.string().describe('The single biggest obstacle.'),
  falsificationTest: z.string().nullable().describe('Small, observable next test that could show the thesis is wrong.'),
  validationConditions: z.array(z.string()).describe('Prespecified, observable conditions that would validate the thesis.'),
  invalidationConditions: z.array(z.string()).describe('Prespecified, observable conditions that would invalidate it.'),
  reviewDate: z.string().nullable().describe('YYYY-MM-DD'),
  proposedDecision: z.enum(['PURSUE', 'MONITOR', 'DISMISS', 'NO_MATERIAL_POSITION']),
  evidenceConfidence: z.enum(['low', 'medium', 'high']),
  extendsPositionId: z.string().nullable().describe('If this merely extends a tracked position, its ID; the ledger will review it instead.'),
  commercial: z.boolean().describe('True if this is a commercially actionable hypothesis (then the rubric is required).'),
  rubric: RubricOutput.nullable(),
});
export type CandidateOutput = z.infer<typeof CandidateOutput>;

export const GenerateOutput = z.object({ candidates: z.array(CandidateOutput) });

export interface GenerateInput {
  localIssueDate: string;
  consequences: { consequenceId: string; statement: string; mechanism: string; assumptions: string[]; alternatives: string[]; evidenceConfidence: string; observedClaimIds: string[] }[];
  claims: { claimId: string; text: string; type: string; eventState: string; support: string; caveat?: string }[];
  trackedPositions: { positionId: string; thesis: string; status: string }[];
}

export const GENERATE_CANDIDATES: LlmTask<GenerateInput, z.infer<typeof GenerateOutput>> = {
  name: 'position.generate_candidates',
  version: 'v1.0.0',
  system: `${EVIDENCE_POLICY}

Task (012 Position Engine — candidate generation): translate the accepted consequences into 2–4 candidate positions.
A position is not always a startup idea: it can be a market opportunity, a risk, an operational implication, or an explicit no-action judgement.
For each: target actor → decision to consider → why now → supporting observations (claim IDs) → economic mechanism → strongest counterargument → biggest blocker → falsification test → validation and invalidation conditions → review date.
For commercially actionable hypotheses (commercial = true) fill all 14 rubric dimensions on 0–10 with a rationale each; set score null and unknown true when the evidence does not allow a judgement — never invent precision. Saturation (0 underserved … 10 crowded) and execution/regulatory risk (10 = high risk) are reverse-scaled.
Execution fit: name an operator archetype (e.g. "seed-stage B2B software team with regulated-industry sales experience") or set operatorArchetype null and mark fit unknown. Never score fit against an unstated personal profile.
Name competitors only if they appear in the supplied claims. Do not claim an unoccupied niche without evidence. Buyer demand and willingness to pay are unvalidated unless a claim shows customer evidence.
If the new evidence merely extends a tracked position, set extendsPositionId instead of proposing a duplicate.`,
  render: (i) => `<localIssueDate>${i.localIssueDate}</localIssueDate>
<consequences>
${i.consequences.map((c) => JSON.stringify(c)).join('\n')}
</consequences>
<claims>
${i.claims.map((c) => `<claim id="${c.claimId}" type="${c.type}" eventState="${c.eventState}" support="${c.support}">${c.text}${c.caveat ? ` [caveat: ${c.caveat}]` : ''}</claim>`).join('\n')}
</claims>
<trackedPositions>
${i.trackedPositions.map((p) => `<position id="${p.positionId}" status="${p.status}">${p.thesis}</position>`).join('\n') || 'none'}
</trackedPositions>`,
  output: GenerateOutput,
  maxTokens: 24000,
  effort: 'high',
};

// ------------------------------------------------------------ runAdversarialReview (distinct critique pass)

export const AdversarialOutput = z.object({
  findings: z.array(
    z.object({
      category: z.enum([
        'overstated_novelty',
        'weak_demand_evidence',
        'absent_competitor_knowledge',
        'implausible_differentiation',
        'compliance_or_employer_overlap',
        'unfalsifiable_test',
        'causal_leap',
        'unsupported_fact',
        'other',
      ]),
      severity: z.enum(['blocking', 'major', 'minor']),
      detail: z.string(),
    }),
  ),
  verdict: z.enum(['pass', 'revise', 'block']),
  decisiveObstacle: z.string(),
  smallestNextTest: z.string(),
});

export interface AdversarialInput {
  candidate: Omit<CandidateOutput, 'rubric'> & { rubric?: unknown };
  claims: GenerateInput['claims'];
}

export const ADVERSARIAL_REVIEW: LlmTask<AdversarialInput, z.infer<typeof AdversarialOutput>> = {
  name: 'position.adversarial_review',
  version: 'v1.0.0',
  system: `${EVIDENCE_POLICY}

You are the adversarial reviewer for the 012 Position Engine. You did not write this position. Attack it:
overstated novelty; weak or absent demand evidence; missing competitor knowledge; implausible differentiation; compliance, conflict-of-interest or employer-overlap risk; causal leaps; facts not in the evidence; next tests that cannot falsify the thesis.
"block" = a blocking flaw (unsupported fact, unfalsifiable, or the conclusion does not follow). "revise" = usable only with stated caveats or a downgraded verdict. "pass" = defensible as stated.
Name the one decisive obstacle and the smallest next validation step.`,
  render: (i) => `<position>${JSON.stringify(i.candidate)}</position>
<evidence>
${i.claims.map((c) => `<claim id="${c.claimId}" type="${c.type}" support="${c.support}">${c.text}</claim>`).join('\n')}
</evidence>`,
  output: AdversarialOutput,
  maxTokens: 8000,
  effort: 'high',
};

// ------------------------------------------------------------ rankForEditorialSelection → finalizePosition

export const FinalizeOutput = z.object({
  selectedCandidateId: z.string().nullable().describe('null = no candidate clears the bar'),
  rationale: z.string().describe('Why this is the most decision-useful position (not necessarily the highest score).'),
  noPositionStatement: z.string().nullable().describe('Reader-facing monitor/no-action conclusion when nothing is selected.'),
});

export interface FinalizeInput {
  candidates: {
    candidateId: string;
    kind: string;
    thesis: string;
    decision: string;
    gateNotes: string[];
    critiqueVerdict: string;
    decisiveObstacle: string;
    priority: number | null;
    evidenceConfidence: string;
  }[];
}

export const FINALIZE: LlmTask<FinalizeInput, z.infer<typeof FinalizeOutput>> = {
  name: 'position.finalize',
  version: 'v1.0.0',
  system: `${EVIDENCE_POLICY}

Task (012 Position Engine — final selection): choose the single most decision-useful position for today's reader from the gate-passing candidates, or none.
Prefer the most defensible judgement over the highest arithmetic score. If nothing clears the bar, return null and a short reader-facing monitor/no-action statement.`,
  render: (i) => `<candidates>
${i.candidates.map((c) => JSON.stringify(c)).join('\n')}
</candidates>`,
  output: FinalizeOutput,
  maxTokens: 4000,
  effort: 'high',
};
