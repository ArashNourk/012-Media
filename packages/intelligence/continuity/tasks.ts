import { z } from 'zod';
import { LedgerStatus } from '../../contracts';
import type { LlmTask } from '../../connectors/llm/types';
import { EVIDENCE_POLICY } from '../context';

export const AssessOutput = z.object({
  effect: z.enum(['material_change', 'adjacent', 'no_effect']),
  proposedStatus: LedgerStatus,
  whyThisAltersJudgment: z.string().describe('Explicit reason the new facts change (or do not change) the original thesis, action, conditions, confidence or timing.'),
  conditionRefs: z.array(z.string()).describe('Labels of the prespecified conditions the new evidence bears on, e.g. "V1", "I2".'),
  citedClaimIds: z.array(z.string()),
  publicLine: z.string().describe('One or two reader-facing sentences for the continuity thread; no new facts beyond the cited claims.'),
});
export type AssessOutput = z.infer<typeof AssessOutput>;

export interface AssessInput {
  position: {
    positionId: string;
    firstIdentifiedOn: string;
    originalThesis: string;
    decision: string;
    currentStatus: string;
    latestRevision: string | null;
    validationConditions: { label: string; text: string }[];
    invalidationConditions: { label: string; text: string }[];
  };
  newClaims: { claimId: string; text: string; type: string; eventState: string; support: string; caveat?: string; publishedAt?: string; publisher: string }[];
}

export const ASSESS_CONTINUITY: LlmTask<AssessInput, AssessOutput> = {
  name: 'continuity.assess',
  version: 'v1.0.0',
  system: `${EVIDENCE_POLICY}

Task (012 Continuity Ledger — review): compare genuinely new evidence with an existing position's immutable original thesis and latest approved revision.
- "material_change" only if the new facts change the thesis, the action, key conditions, confidence or review timing — and say exactly why.
- "adjacent" if the evidence is related but does not alter the judgement (it will be linked privately, status unchanged).
- "no_effect" if it does not bear on the position.
Status options: EMERGING, STRENGTHENING, STABLE, WEAKENING, VALIDATED, INVALIDATED, UNRESOLVED, RETIRED.
VALIDATED requires fulfilment of a prespecified validation condition (cite its V-label); INVALIDATED requires evidence contradicting a prespecified condition (cite its I-label). Positive news alone is not validation.
For adjacent or no_effect, proposedStatus must equal the current status.`,
  render: (i) => `<position id="${i.position.positionId}" firstIdentified="${i.position.firstIdentifiedOn}" status="${i.position.currentStatus}" decision="${i.position.decision}">
<originalThesis>${i.position.originalThesis}</originalThesis>
<latestRevision>${i.position.latestRevision ?? 'none'}</latestRevision>
<validationConditions>
${i.position.validationConditions.map((c) => `<condition label="${c.label}">${c.text}</condition>`).join('\n')}
</validationConditions>
<invalidationConditions>
${i.position.invalidationConditions.map((c) => `<condition label="${c.label}">${c.text}</condition>`).join('\n')}
</invalidationConditions>
</position>
<newEvidence>
${i.newClaims.map((c) => `<claim id="${c.claimId}" type="${c.type}" eventState="${c.eventState}" support="${c.support}" publisher="${c.publisher}" publishedAt="${c.publishedAt ?? ''}">${c.text}${c.caveat ? ` [caveat: ${c.caveat}]` : ''}</claim>`).join('\n')}
</newEvidence>`,
  output: AssessOutput,
  maxTokens: 6000,
  effort: 'high',
};
