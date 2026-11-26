import { createHash, randomBytes } from 'node:crypto';

/**
 * Typed identifiers. Every record kind has a stable prefix so that IDs are
 * self-describing in logs, manifests and audit trails.
 */
export const ID_PREFIX = {
  run: 'RUN',
  source: 'SRC',
  cluster: 'CLU',
  claim: 'CLM',
  signal: 'SIG',
  consequence: 'CSQ',
  positionCandidate: 'PCN',
  scorecard: 'SCR',
  critique: 'CRT',
  continuityProposal: 'CNP',
  revision: 'REV',
  issue: 'ISS',
  approval: 'APR',
  dispatch: 'DSP',
  delivery: 'DLV',
  subscriber: 'SUB',
  application: 'APP',
  llmCall: 'LLM',
  audit: 'AUD',
} as const;

export type IdKind = keyof typeof ID_PREFIX;

/** Time-ordered random ID: PREFIX-<base36 ms>-<8 hex>. */
export function newId(kind: IdKind, now: Date = new Date()): string {
  return `${ID_PREFIX[kind]}-${now.getTime().toString(36).toUpperCase()}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

/** Permanent, human-citable position identifiers: POS-000042. */
export function formatPositionId(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) throw new Error(`invalid position sequence ${sequence}`);
  return `POS-${String(sequence).padStart(6, '0')}`;
}

export const POSITION_ID_PATTERN = /^POS-\d{6}$/;

/**
 * Deterministic ID derived from its inputs. Used for records created inside a
 * run (claims, clusters, signals …) so that a resumed run reproduces the same
 * identifiers and cached analysis inputs stay byte-identical.
 */
export function stableId(kind: IdKind, ...parts: string[]): string {
  const h = createHash('sha256').update(parts.join('␟')).digest('hex').slice(0, 12).toUpperCase();
  return `${ID_PREFIX[kind]}-${h}`;
}
