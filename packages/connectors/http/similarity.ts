import { createHash } from 'node:crypto';
import { normalizeForMatch } from './html';

/** 64 smallest hashes of 8-word shingles: a compact near-duplicate fingerprint. */
export function shingleFingerprint(text: string, k = 8, size = 64): number[] {
  const words = normalizeForMatch(text).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const hashes = new Set<number>();
  for (let i = 0; i + k <= words.length; i++) {
    const h = createHash('md5').update(words.slice(i, i + k).join(' ')).digest();
    hashes.add(h.readUInt32BE(0));
  }
  return [...hashes].sort((a, b) => a - b).slice(0, size);
}

/** Estimated Jaccard similarity of two bottom-k fingerprints. */
export function fingerprintSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  const union = [...new Set([...a, ...b])].sort((x, y) => x - y).slice(0, Math.max(a.length, b.length));
  let both = 0;
  for (const h of union) if (sa.has(h) && sb.has(h)) both++;
  return both / union.length;
}

const STOP = new Set(
  'a an the and or of for to in on at by with from as is are was were be been its it this that these those into over under after before about our we us new today'.split(' '),
);

export function titleTokens(title: string, ignore: string[] = []): Set<string> {
  const ig = new Set(ignore.map((x) => x.toLowerCase()));
  return new Set(
    normalizeForMatch(title)
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w) && !ig.has(w)),
  );
}

/** Overlap coefficient |A∩B| / min(|A|,|B|). */
export function overlapCoefficient(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / Math.min(a.size, b.size);
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / (a.size + b.size - n);
}
