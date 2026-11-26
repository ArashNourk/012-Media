/**
 * Synthetic fixture world (reserved .test domains). Not news; used only by tests.
 */
import { article, sitemap, type Page } from './helpers';

export const U = {
  modelX: 'https://labs.example.test/news/model-x-release',
  compute: 'https://labs.example.test/news/compute-agreement',
  usage: 'https://labs.example.test/news/q3-usage',
  wireDeal: 'https://wire.example.test/news/labs-compute-deal',
  wireRule: 'https://wire.example.test/news/regulator-proposal',
};

export const TEXT = {
  modelX: [
    'Example Labs released Model X to all enterprise customers on November 24, 2026.',
    'Model X is available through the Example Labs API at $2 per million input tokens.',
    'Example Labs said 300 enterprises tested Model X before release.',
  ],
  compute: [
    'Example Labs announced an agreement to purchase 50,000 accelerators from Example Silicon.',
    'Deliveries are expected to begin in 2027. The accelerators are not yet installed.',
  ],
  usage: ['Example Labs said enterprise customers doubled their API usage during the third quarter of 2026.'],
  wireDeal: [
    'Example Labs agreed to buy 50,000 accelerators from Example Silicon, according to a company statement seen by Example Wire.',
    'Analysts said the deal could ease capacity constraints for enterprise customers next year.',
  ],
  wireRule: ['The Example Regulator proposed a rule that would require independent audits of frontier models.', 'The proposal is open for public comment until January 2027.'],
};

const shiftIso = (body: string, days: number) =>
  days ? body.replace(/20\d\d-\d\d-\d\dT[\d:.]+Z/g, (m) => new Date(Date.parse(m) - days * 86_400_000).toISOString()) : body;

/** @param shiftDays move every publication/lastmod timestamp this many days earlier (for DST-date tests). */
export function fixturePages(over: Record<string, Page> = {}, shiftDays = 0): Record<string, Page> {
  const pages: Record<string, Page> = {
    'https://labs.example.test/sitemap.xml': {
      body: sitemap([
        { url: U.modelX, lastmod: '2026-11-24T15:00:00Z' },
        { url: U.compute, lastmod: '2026-11-23T15:00:00Z' },
        { url: U.usage, lastmod: '2026-10-01T15:00:00Z' },
        { url: 'https://labs.example.test/news', lastmod: '2026-11-25T10:00:00Z' },
      ]),
      contentType: 'application/xml',
    },
    'https://wire.example.test/sitemap.xml': {
      body: sitemap([
        { url: U.wireDeal, lastmod: '2026-11-24T18:00:00Z' },
        { url: U.wireRule, lastmod: '2026-11-25T12:00:00Z' },
      ]),
      contentType: 'application/xml',
    },
    [U.modelX]: { body: article({ title: 'Example Labs releases Model X', published: '2026-11-24T14:00:00Z', paragraphs: TEXT.modelX, url: U.modelX }) },
    [U.compute]: { body: article({ title: 'Example Labs announces accelerator purchase agreement', published: '2026-11-23T14:00:00Z', paragraphs: TEXT.compute, url: U.compute }) },
    [U.usage]: { body: article({ title: 'Example Labs third-quarter usage update', published: '2026-10-01T14:00:00Z', paragraphs: TEXT.usage, url: U.usage }) },
    [U.wireDeal]: { body: article({ title: 'Example Labs agrees accelerator purchase agreement with Example Silicon', published: '2026-11-24T17:00:00Z', paragraphs: TEXT.wireDeal, url: U.wireDeal }) },
    [U.wireRule]: { body: article({ title: 'Regulator proposes audits for frontier models', published: '2026-11-25T11:00:00Z', paragraphs: TEXT.wireRule, url: U.wireRule }) },
    'https://labs.example.test/news': { body: article({ title: 'News', published: '2026-11-25T10:00:00Z', paragraphs: ['All news'], url: 'https://labs.example.test/news', type: 'website' }) },
  };
  const all = { ...pages, ...over };
  return Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v.body ? { ...v, body: shiftIso(v.body, shiftDays) } : v]));
}

type Ex = { text: string; type: string; eventState: string; entities: string[]; quantities: { value: string; unit: string }[]; excerpt: string; locator: string; material: boolean; eventAt: string | null; attribution: string | null };
const c = (text: string, excerpt: string, extra: Partial<Ex> = {}): Ex => ({
  text,
  type: 'observed',
  eventState: 'not_applicable',
  entities: ['Example Labs'],
  quantities: [],
  excerpt,
  locator: 'para 1',
  material: true,
  eventAt: null,
  attribution: null,
  ...extra,
});

export const EXTRACTIONS: Record<string, Ex[]> = {
  [U.modelX]: [
    c('Example Labs released Model X to all enterprise customers on 24 November 2026.', 'Example Labs released Model X to all enterprise customers on November 24, 2026.', { eventState: 'completed', eventAt: '2026-11-24' }),
    c('Model X is priced at $2 per million input tokens through the Example Labs API.', 'Model X is available through the Example Labs API at $2 per million input tokens.', { quantities: [{ value: '$2', unit: 'USD per million input tokens' }] }),
    c('Example Labs said 300 enterprises tested Model X before release.', 'Example Labs said 300 enterprises tested Model X before release.', { type: 'reported_claim', quantities: [{ value: '300', unit: 'enterprises' }], attribution: 'Example Labs' }),
  ],
  [U.compute]: [
    c('Example Labs announced an agreement to purchase 50,000 accelerators from Example Silicon.', 'Example Labs announced an agreement to purchase 50,000 accelerators from Example Silicon.', {
      eventState: 'announced',
      entities: ['Example Labs', 'Example Silicon'],
      quantities: [{ value: '50,000', unit: 'accelerators' }],
    }),
    c('Accelerator deliveries are expected to begin in 2027.', 'Deliveries are expected to begin in 2027.', { type: 'forecast', eventState: 'expected', entities: ['Example Labs', 'Example Silicon'] }),
  ],
  [U.wireDeal]: [
    c('Example Labs agreed to buy 50,000 accelerators from Example Silicon, according to a company statement.', 'Example Labs agreed to buy 50,000 accelerators from Example Silicon, according to a company statement seen by Example Wire.', {
      type: 'reported_claim',
      eventState: 'announced',
      entities: ['Example Labs', 'Example Silicon'],
      quantities: [{ value: '50,000', unit: 'accelerators' }],
      attribution: 'company statement via Example Wire',
    }),
  ],
  [U.wireRule]: [
    c('The Example Regulator proposed a rule that would require independent audits of frontier models.', 'The Example Regulator proposed a rule that would require independent audits of frontier models.', { eventState: 'proposed', entities: ['Example Regulator'] }),
  ],
};

/** Scripted analysis outputs. Each can be overridden per test. */
export function scripts(over: Record<string, (input: any) => unknown> = {}): Record<string, (input: any) => unknown> {
  const base: Record<string, (input: any) => unknown> = {
    'signal.extract_claims': (i) => ({ claims: EXTRACTIONS[i.url] ?? [], documentNote: 'fixture' }),
    'signal.verify_support': (i) => ({ judgements: i.claims.map((x: any) => ({ claimKey: x.claimKey, verdict: 'entails', note: 'fixture' })) }),
    'signal.score_cluster': (i) => {
      const title: string = i.cluster.title;
      const isRule = /Regulator/.test(title);
      const isModel = /Model X/.test(title);
      return {
        headline: title,
        eventAt: (i.cluster.sources[0].publishedAt ?? '').slice(0, 10) || null,
        topicTags: isRule ? ['regulation'] : isModel ? ['models'] : ['compute'],
        entities: isRule ? ['Example Regulator'] : ['Example Labs', 'Example Silicon'],
        factors: {
          materiality: { score: isRule ? 2 : 4, rationale: 'fixture' },
          decisionRelevance: { score: isRule ? 2 : 4, rationale: 'fixture' },
          novelty: { score: 3, rationale: 'fixture' },
          causalReach: { score: isRule ? 3 : 4, rationale: 'fixture' },
          sourceReliability: { score: 4, rationale: 'fixture' },
        },
        weakSignal: isRule,
        weakSignalRationale: isRule ? 'An audit requirement could change model release cadence.' : null,
        summary: i.claims.filter((x: any) => x.support !== 'unverified').map((x: any) => x.text).slice(0, 2).join(' '),
        relevance: 'Fixture relevance (inference).',
        evidenceQualifications: [],
        selectionRationale: 'fixture',
        claimIdsUsed: i.claims.map((x: any) => x.claimId),
        criticalClaimIds: i.claims.filter((x: any) => x.material).slice(0, 1).map((x: any) => x.claimId),
      };
    },
    'consequence.map_mechanisms': (i) => ({
      signalId: i.signal.signalId,
      observedChange: i.signal.headline,
      affectedActors: [{ actor: 'enterprise buyers', incentive: 'lower cost' }],
      causalChain: ['event', 'capability', 'buyer response'],
      constraints: ['compute supply'],
      baseline: 'status quo',
      shiftType: 'incremental',
      firstOrderEffects: ['a'],
      secondOrderEffects: ['b'],
      claimIdsUsed: i.signal.claims.map((x: any) => x.claimId),
    }),
    'consequence.synthesize': (i) => ({
      consequences: [
        {
          linkedSignalIds: i.signals.map((s: any) => s.signalId),
          statement: 'Lower model prices may move enterprise pilots into production faster, if capacity keeps up.',
          mechanism: 'Price cut → lower pilot cost → more production deployments (inference).',
          causalChain: ['price cut', 'lower cost of pilots', 'more production deployments'],
          affectedActors: ['enterprise buyers', 'model providers'],
          assumptions: ['Price is a binding constraint on adoption.'],
          alternatives: ['Adoption is constrained by integration work, not price.'],
          disconfirmingIndicators: ['Enterprise usage does not rise within two quarters.'],
          baseline: 'Gradual adoption.',
          constraints: ['compute supply'],
          firstOrderEffects: ['cheaper pilots'],
          secondOrderEffects: ['pressure on rivals'],
          observedClaimIds: i.signals.flatMap((s: any) => s.claims.slice(0, 1).map((x: any) => x.claimId)),
          inferenceNote: 'Price is observed; adoption effect is inference.',
          horizon: 'near',
          evidenceConfidence: 'medium',
          confidenceRationale: 'Pricing is documented; demand response is not.',
          continuityLinks: [],
        },
      ],
    }),
    'consequence.challenge': () => ({ verdict: 'pass', neutralHeadlineTest: 'Still follows.', findings: [] }),
    'position.generate_candidates': (i) => ({
      candidates: [
        {
          kind: 'market_opportunity',
          thesis: 'Integration services for regulated enterprises adopting lower-cost models are worth monitoring.',
          targetActor: 'Enterprise AI service firms',
          decisionToConsider: 'Whether to build a migration offering.',
          whyNow: 'Model X pricing lowers pilot cost.',
          supportingClaimIds: i.consequences[0].observedClaimIds,
          linkedConsequenceIds: [i.consequences[0].consequenceId],
          economicMechanism: 'Lower token cost shifts budget to integration.',
          strongestCounterargument: 'Providers may bundle integration themselves.',
          alternatives: ['Buyers wait for further price cuts.'],
          competitors: [],
          blocker: 'Unverified buyer demand.',
          falsificationTest: 'Ask ten regulated buyers whether price blocked production; fewer than three yes → dismiss.',
          validationConditions: ['Three regulated buyers commit budget within 60 days.'],
          invalidationConditions: ['Buyers report price was not a constraint.'],
          reviewDate: '2026-12-26',
          proposedDecision: 'PURSUE',
          evidenceConfidence: 'medium',
          extendsPositionId: null,
          commercial: true,
          rubric: {
            operatorArchetype: 'Seed-stage B2B services team with regulated-industry delivery experience',
            dimensions: Object.fromEntries(
              ['executionFit', 'marketAttractiveness', 'marketSaturation', 'customerUrgency', 'monetization', 'reachableMarketGrowth', 'differentiation', 'distributionFeasibility', 'mvpFeasibility', 'capitalEfficiency', 'scalability', 'timing', 'executionRegulatoryRisk', 'evidenceConfidence'].map((k) => [
                k,
                k === 'customerUrgency' || k === 'monetization' ? { score: null, rationale: 'No buyer evidence.', unknown: true } : { score: 6, rationale: 'fixture', unknown: false },
              ]),
            ),
          },
        },
      ],
    }),
    'position.adversarial_review': () => ({ findings: [{ category: 'weak_demand_evidence', severity: 'major', detail: 'No buyer evidence.' }], verdict: 'revise', decisiveObstacle: 'Unverified buyer demand.', smallestNextTest: 'Ten buyer interviews.' }),
    'position.finalize': (i) => ({ selectedCandidateId: i.candidates[0]?.candidateId ?? null, rationale: 'Most decision-useful.', noPositionStatement: null }),
    'continuity.assess': (i) => ({
      effect: 'material_change',
      proposedStatus: 'STRENGTHENING',
      whyThisAltersJudgment: 'A price cut supports the adoption thesis condition V1 trajectory.',
      conditionRefs: ['V1'],
      citedClaimIds: i.newClaims.slice(0, 1).map((x: any) => x.claimId),
      publicLine: 'New pricing evidence supports the adoption thesis; demand remains unverified.',
    }),
    'editorial.compose': () => ({ headline: 'Cheaper models, unproven demand', lead: 'Example Labs cut the price of access to Model X. Whether that moves enterprises from pilots to production is not yet evidenced.' }),
    'editorial.adversarial_check': () => ({ verdict: 'pass', findings: [] }),
  };
  return { ...base, ...over };
}

export const SEED = {
  firstIdentifiedOn: '2026-10-02',
  seedNote: 'Fixture seed position for continuity tests; not a published edition.',
  thesis: 'Enterprise API usage growth will make model price the decisive procurement variable for regulated buyers.',
  decision: 'MONITOR' as const,
  rationale: 'fixture',
  targetActor: 'Regulated enterprise buyers',
  decisionToConsider: 'Whether to prioritise price in vendor selection.',
  alternatives: ['Security certification remains decisive.'],
  blocker: 'Limited buyer evidence.',
  falsificationTest: 'Procurement surveys show price ranked below security.',
  reviewDate: '2026-12-02',
  entities: ['Example Labs'],
  topicTags: ['enterprise', 'models'],
  validationConditions: ['A major provider cuts enterprise API prices within 90 days.'],
  invalidationConditions: ['Providers raise enterprise prices.'],
  initialStatus: 'EMERGING' as const,
  evidence: [
    {
      url: U.usage,
      claims: [
        {
          text: 'Example Labs said enterprise customers doubled their API usage in the third quarter of 2026.',
          type: 'reported_claim' as const,
          eventState: 'not_applicable' as const,
          entities: ['Example Labs'],
          quantities: [],
          excerpt: 'Example Labs said enterprise customers doubled their API usage during the third quarter of 2026.',
          locator: 'para 1',
          material: true,
        },
      ],
    },
  ],
};
