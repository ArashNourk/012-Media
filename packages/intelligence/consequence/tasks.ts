import { z } from 'zod';
import type { LlmTask } from '../../connectors/llm/types';
import { EVIDENCE_POLICY } from '../context';

export interface SignalForAnalysis {
  signalId: string;
  headline: string;
  eventAt?: string;
  summary: string;
  qualifications: string[];
  claims: { claimId: string; text: string; type: string; eventState: string; support: string; caveat?: string }[];
}

export interface TrackedPositionBrief {
  positionId: string;
  thesis: string;
  status: string;
  validationConditions: string[];
  invalidationConditions: string[];
}

const renderSignals = (signals: SignalForAnalysis[]) =>
  signals
    .map(
      (s) => `<signal id="${s.signalId}" eventAt="${s.eventAt ?? ''}">
<headline>${s.headline}</headline>
<summary>${s.summary}</summary>
<qualifications>${s.qualifications.join(' | ')}</qualifications>
${s.claims.map((c) => `<claim id="${c.claimId}" type="${c.type}" eventState="${c.eventState}" support="${c.support}">${c.text}${c.caveat ? ` [caveat: ${c.caveat}]` : ''}</claim>`).join('\n')}
</signal>`,
    )
    .join('\n');

const renderPositions = (ps: TrackedPositionBrief[]) =>
  ps
    .map(
      (p) => `<position id="${p.positionId}" status="${p.status}">
<thesis>${p.thesis}</thesis>
<validationConditions>${p.validationConditions.join(' | ')}</validationConditions>
<invalidationConditions>${p.invalidationConditions.join(' | ')}</invalidationConditions>
</position>`,
    )
    .join('\n') || 'none';

// ------------------------------------------------------------ mapAffectedActors → deriveCausalMechanisms → mapDependenciesAndConstraints → first/second order

export const MapMechanismsOutput = z.object({
  signalId: z.string(),
  observedChange: z.string().describe('What directly changed, in neutral words, from supported claims only.'),
  affectedActors: z.array(z.object({ actor: z.string(), incentive: z.string() })),
  causalChain: z.array(z.string()).describe('event → capability/constraint → stakeholder response → commercial/economic consequence; one step per item.'),
  constraints: z.array(z.string()).describe('technology readiness, regulation, distribution, power/compute, incentives, adoption'),
  baseline: z.string().describe('What would likely have continued without this development.'),
  shiftType: z.enum(['structural', 'incremental', 'unclear']),
  firstOrderEffects: z.array(z.string()),
  secondOrderEffects: z.array(z.string()),
  claimIdsUsed: z.array(z.string()),
});
export type MapMechanismsOutput = z.infer<typeof MapMechanismsOutput>;

export const MAP_MECHANISMS: LlmTask<{ signal: SignalForAnalysis }, MapMechanismsOutput> = {
  name: 'consequence.map_mechanisms',
  version: 'v1.0.0',
  system: `${EVIDENCE_POLICY}

Task (012 Consequence Engine — mechanism mapping) for ONE verified signal:
1. State the directly observed change and who is affected (with their incentive).
2. Write an explicit causal chain with intermediate mechanisms. No step may assume a fact not in the claims; mark inferential steps with "(inference)".
3. List enabling constraints and the baseline (what would continue without this).
4. Say whether this is a structural shift or incremental news, and why that is uncertain if it is.`,
  render: (i) => renderSignals([i.signal]),
  output: MapMechanismsOutput,
  maxTokens: 8000,
  effort: 'high',
};

// ------------------------------------------------------------ testCounterfactuals → competing explanations → disconfirming evidence → synthesize

export const SynthesizedConsequence = z.object({
  linkedSignalIds: z.array(z.string()),
  statement: z.string().describe('The implication, one or two sentences. Conditional where uncertain.'),
  mechanism: z.string().describe('Explicit because-chain in prose.'),
  causalChain: z.array(z.string()),
  affectedActors: z.array(z.string()),
  assumptions: z.array(z.string()).describe('At least one assumption the chain requires.'),
  alternatives: z.array(z.string()).describe('At least one realistic competing interpretation.'),
  disconfirmingIndicators: z.array(z.string()).describe('Observable evidence that would show this is wrong.'),
  baseline: z.string(),
  constraints: z.array(z.string()),
  firstOrderEffects: z.array(z.string()),
  secondOrderEffects: z.array(z.string()),
  observedClaimIds: z.array(z.string()).describe('Verified claims the consequence rests on.'),
  inferenceNote: z.string().describe('Which parts are observation and which are inference.'),
  horizon: z.enum(['near', 'medium', 'long', 'unknown']),
  evidenceConfidence: z.enum(['low', 'medium', 'high']),
  confidenceRationale: z.string().describe('Expert judgement in prose; not a probability.'),
  continuityLinks: z.array(z.object({ positionId: z.string(), effect: z.enum(['supports', 'weakens', 'no_effect']), rationale: z.string() })),
});

export const SynthesizeOutput = z.object({ consequences: z.array(SynthesizedConsequence) });

export interface SynthesizeInput {
  signals: SignalForAnalysis[];
  mechanisms: MapMechanismsOutput[];
  trackedPositions: TrackedPositionBrief[];
}

export const SYNTHESIZE: LlmTask<SynthesizeInput, z.infer<typeof SynthesizeOutput>> = {
  name: 'consequence.synthesize',
  version: 'v1.0.0',
  system: `${EVIDENCE_POLICY}

Task (012 Consequence Engine — synthesis): propose up to four bounded consequences, preferably cross-signal, of how change propagates.
For each: explicit mechanism, at least one required assumption, at least one realistic competing explanation, a counterfactual baseline, timing/constraints, and observable disconfirming indicators.
Check each tracked position: does this evidence support, weaken, or not affect it? Only claim "supports"/"weakens" with a stated reason tied to the position's conditions.
Fewer, better consequences are preferred. If competing explanations cannot be separated, say so and lower confidence.
Editorial test: the implication must still make sense if the headline were replaced by a neutral factual description.`,
  render: (i) => `<signals>
${renderSignals(i.signals)}
</signals>
<mechanisms>
${i.mechanisms.map((m) => JSON.stringify(m)).join('\n')}
</mechanisms>
<trackedPositions>
${renderPositions(i.trackedPositions)}
</trackedPositions>`,
  output: SynthesizeOutput,
  maxTokens: 16000,
  effort: 'high',
};

// ------------------------------------------------------------ challenge pass (distinct critic)

export const ChallengeOutput = z.object({
  verdict: z.enum(['pass', 'revise', 'hold']),
  neutralHeadlineTest: z.string().describe('Restate the underlying facts neutrally; does the implication still follow?'),
  findings: z.array(z.string()).describe('Causal leaps, missing assumptions, overstated certainty, ignored alternatives.'),
});

export interface ChallengeInput {
  consequence: z.infer<typeof SynthesizedConsequence>;
  claims: SignalForAnalysis['claims'];
}

export const CHALLENGE: LlmTask<ChallengeInput, z.infer<typeof ChallengeOutput>> = {
  name: 'consequence.challenge',
  version: 'v1.0.0',
  system: `${EVIDENCE_POLICY}

You are the adversarial reviewer for the 012 Consequence Engine. You did not write this consequence; your job is to find what is wrong with it.
- "hold": the causal chain depends on a fact not in the claims, or the conclusion does not follow.
- "revise": it follows only with a stated caveat it does not yet carry, or it overstates certainty or timing.
- "pass": the chain is explicit, the assumptions and alternatives are real, and disconfirming indicators are observable.`,
  render: (i) => `<consequence>${JSON.stringify(i.consequence)}</consequence>
<evidence>
${i.claims.map((c) => `<claim id="${c.claimId}" type="${c.type}" eventState="${c.eventState}" support="${c.support}">${c.text}</claim>`).join('\n')}
</evidence>`,
  output: ChallengeOutput,
  maxTokens: 6000,
  effort: 'high',
};
