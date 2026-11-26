import type { Claim, ClaimSupport, EventState, SourceDocument, VerificationCheck } from '../../contracts';
import { normalizeForMatch } from '../../connectors/http/html';
import { jaccard, titleTokens } from '../../connectors/http/similarity';
import { extractNumbers } from '../shared/numbers';

export const VERIFIER_VERSION = 'signal.verify/1.0.0';

/** Lexical cues an excerpt must contain for a claim to assert a given event stage. */
const STATE_CUES: Partial<Record<EventState, RegExp>> = {
  proposed: /propos|draft|consult|bill\b|would\b/,
  planned: /plan|intend|will\b|expect|aim|prepar|upcoming|coming/,
  expected: /expect|anticipat|will\b|estimat|forecast|project|target|by the end of|coming/,
  approved: /approv|authori[sz]|declared effective|enact|signed|cleared|granted|certif/,
  purchased: /purchas|acquir|bought|\bbuy|sale of|sold/,
  shipped: /ship|deliver/,
  installed: /install|deploy/,
  operational: /operational|online|in operation|in service|\blive\b|running|generally available|now available|now use|are using|uses /,
  completed: /closed|closing of|complet|finish|conclud|began|started|made generally available|made available|raised|filed|launch|releas|introduc|signed|opened|agreed|now /,
};

const FORWARD_LOOKING = /\b(expected to|expects to|will (?!not receive)|plans? to|intends? to|estimated to|aims? to|is set to|are set to|anticipates?)\b/;

export interface VerificationInput {
  claim: Omit<Claim, 'support' | 'verification' | 'caveat'> & { attribution?: string | null };
  source: SourceDocument;
  sourceText: string;
  entailment?: { verdict: 'entails' | 'partially_entails' | 'does_not_entail'; note: string };
  verifiedAt: string;
}

/**
 * Deterministic claim-to-source verification. The gate is deliberately
 * conservative: a missing excerpt, a number not present in the excerpt, a
 * stage the excerpt does not express, a non-article source or a failed
 * semantic support check all leave the claim `unverified`.
 */
export function verifyClaim(input: VerificationInput): Pick<Claim, 'support' | 'caveat' | 'verification'> {
  const { claim, source, sourceText } = input;
  const checks: VerificationCheck[] = [];
  const caveats: string[] = [];
  const prov = claim.provenance[0];
  const excerpt = prov.excerpt ?? '';
  const nExcerpt = normalizeForMatch(excerpt);
  const nText = normalizeForMatch(sourceText);

  checks.push({
    name: 'source_retrieved_article',
    passed: source.retrievalStatus === 'ok' && source.httpStatus === 200,
    detail:
      source.retrievalStatus === 'ok'
        ? `HTTP ${source.httpStatus}, ${source.articleType}, ${source.canonicalUrl}`
        : `retrieval status ${source.retrievalStatus}${source.retrievalNote ? `: ${source.retrievalNote}` : ''}`,
  });

  checks.push({
    name: 'provenance_matches_retrieved_url',
    passed: prov.sourceId === source.id && prov.canonicalUrl === source.canonicalUrl,
    detail: prov.canonicalUrl === source.canonicalUrl ? 'provenance URL is the retrieved canonical URL' : `provenance URL ${prov.canonicalUrl} ≠ retrieved ${source.canonicalUrl}`,
  });

  const longEnough = nExcerpt.length >= 20;
  const found = longEnough && nText.includes(nExcerpt);
  checks.push({
    name: 'excerpt_in_source',
    passed: found,
    detail: !longEnough ? 'excerpt shorter than 20 characters' : found ? 'verbatim excerpt located in retrieved text' : 'excerpt not found in the retrieved document text',
  });

  checks.push({
    name: 'excerpt_within_rights_bound',
    passed: excerpt.length <= source.rights.excerptMaxChars,
    detail: `${excerpt.length}/${source.rights.excerptMaxChars} characters`,
  });

  const excerptNums = new Set(extractNumbers(excerpt));
  const claimNums = [...new Set([...extractNumbers(claim.text), ...claim.quantities.flatMap((q) => extractNumbers(q.value))])];
  const missingNums = claimNums.filter((n) => !excerptNums.has(n));
  checks.push({
    name: 'quantities_in_excerpt',
    passed: missingNums.length === 0,
    detail: missingNums.length ? `numbers not present in excerpt: ${missingNums.join(', ')}` : `${claimNums.length} number(s) traced to excerpt`,
  });

  const cue = STATE_CUES[claim.eventState];
  const stateOk = !cue || cue.test(nExcerpt);
  checks.push({
    name: 'event_state_supported',
    passed: stateOk,
    detail: stateOk ? `stage "${claim.eventState}" expressed in excerpt` : `excerpt does not express stage "${claim.eventState}"`,
  });

  if (claim.type === 'observed' && FORWARD_LOOKING.test(nExcerpt) && !['planned', 'expected', 'proposed'].includes(claim.eventState)) {
    caveats.push('Source statement is forward-looking; treat as expectation, not outcome.');
    checks.push({ name: 'tense_consistency', passed: true, detail: 'qualified: forward-looking source language' });
  }

  if (claim.type === 'reported_claim') caveats.push(`Reported by ${claim.attribution ?? prov.publisher}; not independently verified.`);
  if (claim.type === 'forecast') caveats.push('Forecast or estimate, not an observed outcome.');
  if (claim.type === 'hypothesis' || claim.type === 'inference') caveats.push('Analytical inference, not a sourced fact.');

  // Self-reported: the publisher is one of the entities the claim is about.
  if (claim.entities.some((e) => normalizeForMatch(e).includes(normalizeForMatch(source.publisher)))) {
    caveats.push(`Self-reported by ${source.publisher}.`);
  }

  if (input.entailment) {
    const e = input.entailment;
    checks.push({ name: 'semantic_support', passed: e.verdict !== 'does_not_entail', detail: `${e.verdict}: ${e.note}` });
    if (e.verdict === 'partially_entails') caveats.push(`Partially supported: ${e.note}`);
  } else {
    checks.push({ name: 'semantic_support', passed: false, detail: 'semantic support check did not run' });
  }

  const hardFail = checks.some((c) => !c.passed);
  let support: ClaimSupport;
  if (hardFail) support = 'unverified';
  else if (caveats.some((c) => !c.startsWith('Self-reported')) || claim.type !== 'observed') support = 'qualified';
  else support = 'supported';

  return {
    support,
    caveat: caveats.length ? [...new Set(caveats)].join(' ') : undefined,
    verification: { verifierVersion: VERIFIER_VERSION, verifiedAt: input.verifiedAt, checks, contradictsClaimIds: [] },
  };
}

/**
 * Cross-source contradiction detection inside an event cluster. Claims with
 * the same unit, similar wording and different figures are flagged. When the
 * claims assert different stages or come from documents published at
 * different times, the older one is marked superseded (e.g. an expected
 * offering size replaced by the closed amount) rather than contradicted.
 */
export function detectContradictions(claims: Claim[], sources: Map<string, SourceDocument>): Claim[] {
  const out = claims.map((c) => ({ ...c, verification: { ...c.verification, contradictsClaimIds: [...(c.verification.contradictsClaimIds ?? [])] } }));
  for (let i = 0; i < out.length; i++) {
    for (let k = i + 1; k < out.length; k++) {
      const a = out[i];
      const b = out[k];
      const sa = a.provenance[0].sourceId;
      const sb = b.provenance[0].sourceId;
      if (sa === sb) continue;
      if (a.support === 'unverified' || b.support === 'unverified') continue;
      const ua = new Set(a.quantities.map((q) => q.unit.toLowerCase()));
      const shared = b.quantities.filter((q) => ua.has(q.unit.toLowerCase()));
      if (!shared.length) continue;
      if (jaccard(titleTokens(a.text), titleTokens(b.text)) < 0.5) continue;
      const na = new Set(a.quantities.flatMap((q) => extractNumbers(q.value)));
      const differs = b.quantities.flatMap((q) => extractNumbers(q.value)).some((n) => !na.has(n));
      if (!differs) continue;
      const pa = sources.get(sa)?.publishedAt ?? '';
      const pb = sources.get(sb)?.publishedAt ?? '';
      if (a.eventState !== b.eventState || pa !== pb) {
        const [older, newer] = pa <= pb ? [a, b] : [b, a];
        older.verification.supersededByClaimId = newer.id;
        older.caveat = [older.caveat, `Superseded by a later figure (${newer.id}).`].filter(Boolean).join(' ');
        if (older.support === 'supported') older.support = 'qualified';
      } else {
        a.support = 'contradicted';
        b.support = 'contradicted';
        a.verification.contradictsClaimIds.push(b.id);
        b.verification.contradictsClaimIds.push(a.id);
      }
    }
  }
  return out;
}
