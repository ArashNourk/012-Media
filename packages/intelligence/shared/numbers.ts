/**
 * Numeric tracing: every number that appears in reader-facing prose must be
 * traceable to a verified claim. Years and ordinal-like small integers are
 * ignored because they are dates or list positions, not assertions.
 */
export function extractNumbers(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/(?<![\w.])\$?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(?![\w])/g)) {
    const intPart = m[1].replace(/,/g, '');
    const value = m[2] ? `${intPart}.${m[2]}` : intPart;
    out.push(normalizeNumber(value));
  }
  return out;
}

export function normalizeNumber(v: string): string {
  const cleaned = v.replace(/[,$\s]/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return cleaned;
  return String(n);
}

function isIgnorable(n: string): boolean {
  const x = Number(n);
  if (!Number.isFinite(x)) return true;
  if (Number.isInteger(x) && x >= 1990 && x <= 2100) return true; // years
  if (Number.isInteger(x) && x >= 0 && x <= 10) return true; // counts like "two", list ordinals, "00/01/02"
  return false;
}

/** Numbers present in `prose` that do not occur in any of the evidence texts. */
export function untracedNumbers(prose: string, evidenceTexts: string[]): string[] {
  const allowed = new Set(evidenceTexts.flatMap((t) => extractNumbers(t)));
  return [...new Set(extractNumbers(prose))].filter((n) => !isIgnorable(n) && !allowed.has(n));
}
