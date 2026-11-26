import type { LedgerStatus } from './schemas';

/**
 * Editorial ratification and publication state machine (Architecture §9).
 * Transitions are enforced in the repository; skipping stages is impossible.
 */
export const ISSUE_STATES = [
  'COLLECTED',
  'VERIFIED',
  'SYNTHESIZED',
  'CHALLENGED',
  'DRAFTED',
  'EDITOR_APPROVED',
  'RENDERED',
  'SEND_READY',
  'SENT',
  'HELD_FOR_EVIDENCE',
  'HELD_FOR_APPROVAL',
  'FAILED_RENDER',
  'FAILED_DELIVERY',
  'CORRECTED',
  'WITHDRAWN',
] as const;
export type IssueState = (typeof ISSUE_STATES)[number];

const T: Record<IssueState, IssueState[]> = {
  COLLECTED: ['VERIFIED', 'HELD_FOR_EVIDENCE', 'WITHDRAWN'],
  VERIFIED: ['SYNTHESIZED', 'HELD_FOR_EVIDENCE', 'WITHDRAWN'],
  SYNTHESIZED: ['CHALLENGED', 'HELD_FOR_EVIDENCE', 'WITHDRAWN'],
  CHALLENGED: ['DRAFTED', 'HELD_FOR_EVIDENCE', 'WITHDRAWN'],
  DRAFTED: ['EDITOR_APPROVED', 'HELD_FOR_APPROVAL', 'HELD_FOR_EVIDENCE', 'DRAFTED', 'WITHDRAWN'],
  HELD_FOR_APPROVAL: ['EDITOR_APPROVED', 'DRAFTED', 'WITHDRAWN'],
  HELD_FOR_EVIDENCE: ['COLLECTED', 'WITHDRAWN'],
  EDITOR_APPROVED: ['RENDERED', 'FAILED_RENDER', 'DRAFTED', 'WITHDRAWN'], // DRAFTED = changed after approval → reapproval
  FAILED_RENDER: ['RENDERED', 'DRAFTED', 'WITHDRAWN'],
  RENDERED: ['SEND_READY', 'DRAFTED', 'WITHDRAWN'],
  SEND_READY: ['SENT', 'FAILED_DELIVERY', 'WITHDRAWN'],
  FAILED_DELIVERY: ['SENT', 'FAILED_DELIVERY'],
  SENT: ['CORRECTED'],
  CORRECTED: ['CORRECTED'],
  WITHDRAWN: [],
};

export function canTransition(from: IssueState, to: IssueState): boolean {
  return T[from].includes(to);
}

export function assertTransition(from: IssueState, to: IssueState): void {
  if (!canTransition(from, to)) throw new IllegalTransitionError(from, to);
}

export class IllegalTransitionError extends Error {
  constructor(
    public from: string,
    public to: string,
  ) {
    super(`illegal issue state transition ${from} → ${to}`);
  }
}

/** Ledger status transitions. RETIRED and the terminal verdicts end tracking. */
const LEDGER_T: Record<LedgerStatus, LedgerStatus[]> = {
  EMERGING: ['STRENGTHENING', 'STABLE', 'WEAKENING', 'VALIDATED', 'INVALIDATED', 'UNRESOLVED', 'RETIRED'],
  STRENGTHENING: ['STABLE', 'WEAKENING', 'VALIDATED', 'INVALIDATED', 'UNRESOLVED', 'RETIRED', 'STRENGTHENING'],
  STABLE: ['STRENGTHENING', 'WEAKENING', 'VALIDATED', 'INVALIDATED', 'UNRESOLVED', 'RETIRED'],
  WEAKENING: ['STRENGTHENING', 'STABLE', 'VALIDATED', 'INVALIDATED', 'UNRESOLVED', 'RETIRED', 'WEAKENING'],
  UNRESOLVED: ['STRENGTHENING', 'STABLE', 'WEAKENING', 'VALIDATED', 'INVALIDATED', 'RETIRED'],
  VALIDATED: ['RETIRED'],
  INVALIDATED: ['RETIRED'],
  RETIRED: [],
};

export function canTransitionLedger(from: LedgerStatus, to: LedgerStatus): boolean {
  return LEDGER_T[from].includes(to);
}
