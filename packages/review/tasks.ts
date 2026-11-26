import { z } from 'zod';
import type { LlmTask } from '../connectors/llm/types';
import { EVIDENCE_POLICY } from '../intelligence/context';

export const ComposeOutput = z.object({
  headline: z.string().describe('Edition headline: the most consequential change. Restrained, no hype.'),
  lead: z.string().describe('2–3 sentences: what changed and why this edition matters. Only facts present in the material.'),
});

export interface ComposeInput {
  localIssueDate: string;
  signals: { signalId: string; headline: string; summary: string; relevance: string; qualifications: string[] }[];
  consequences: { consequenceId: string; statement: string }[];
  position: { decision: string; thesis: string } | null;
  noPositionStatement?: string;
  continuity: { positionId: string; line: string }[];
}

export const COMPOSE: LlmTask<ComposeInput, z.infer<typeof ComposeOutput>> = {
  name: 'editorial.compose',
  version: 'v1.0.0',
  system: `${EVIDENCE_POLICY}

Task (editorial assembly): write the edition headline and short lead for the 012 MEDIA "01 / AI ECONOMY" brief from the approved structured material below.
Start with insight rather than source volume. Do not introduce any fact, number or name not in the material. Keep qualifications intact (e.g. self-reported figures stay attributed).`,
  render: (i) => `<edition date="${i.localIssueDate}">
${JSON.stringify({ signals: i.signals, consequences: i.consequences, position: i.position, noPositionStatement: i.noPositionStatement, continuity: i.continuity })}
</edition>`,
  output: ComposeOutput,
  maxTokens: 3000,
  effort: 'high',
};

export const DraftCheckOutput = z.object({
  verdict: z.enum(['pass', 'revise', 'hold']),
  findings: z.array(z.object({ section: z.string(), severity: z.enum(['blocking', 'major', 'minor']), detail: z.string() })),
});

export interface DraftCheckInput {
  draft: unknown;
  claims: { claimId: string; text: string; support: string; caveat?: string }[];
}

export const DRAFT_ADVERSARIAL_CHECK: LlmTask<DraftCheckInput, z.infer<typeof DraftCheckOutput>> = {
  name: 'editorial.adversarial_check',
  version: 'v1.0.0',
  system: `${EVIDENCE_POLICY}

You are the final adversarial reader of a 012 MEDIA draft edition before it goes to a human editor.
Find: any reader-facing statement presented as fact that the verified claims do not support; lost qualifications (self-reported, forecast, superseded); announcements described as completed outcomes; causal claims stated with more certainty than the consequence record allows; a position whose next test cannot falsify it; hype or marketing language.
"hold" = a blocking factual problem. "revise" = fixable wording problems. "pass" = ready for editor review.`,
  render: (i) => `<draft>${JSON.stringify(i.draft)}</draft>
<verifiedClaims>
${i.claims.map((c) => `<claim id="${c.claimId}" support="${c.support}">${c.text}${c.caveat ? ` [caveat: ${c.caveat}]` : ''}</claim>`).join('\n')}
</verifiedClaims>`,
  output: DraftCheckOutput,
  maxTokens: 6000,
  effort: 'high',
};
