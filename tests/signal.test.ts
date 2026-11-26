import { describe, expect, it } from 'vitest';
import { retrieveSource } from '../packages/connectors/http/retrieve';
import { clusterEvents } from '../packages/intelligence/signal/cluster';
import { SignalEngine, selectSignals } from '../packages/intelligence/signal/engine';
import { detectContradictions, verifyClaim } from '../packages/intelligence/signal/verify';
import type { Claim, SourceDocument } from '../packages/contracts';
import { FakeFetcher, LABS, WIRE, article, makeWorld } from './helpers';
import { U, fixturePages, scripts } from './fixtures';

const NOW = () => new Date('2026-11-25T22:00:00Z');

async function src(pages: Record<string, any>, url: string, pub = LABS) {
  return retrieveSource(new FakeFetcher(pages), url, pub, NOW);
}

function claimFor(doc: SourceDocument, over: Partial<Claim> & { excerpt: string }): Parameters<typeof verifyClaim>[0]['claim'] {
  return {
    id: 'CLM-T',
    runId: 'RUN-T',
    text: over.text ?? over.excerpt,
    type: over.type ?? 'observed',
    eventState: over.eventState ?? 'not_applicable',
    entities: over.entities ?? ['Example Labs'],
    quantities: over.quantities ?? [],
    material: true,
    provenance: [{ sourceId: doc.id, canonicalUrl: over.provenance?.[0]?.canonicalUrl ?? doc.canonicalUrl, publisher: doc.publisher, retrievedAt: doc.retrievedAt, locator: 'p1', excerpt: over.excerpt }],
  };
}

const entails = { verdict: 'entails' as const, note: 'ok' };

describe('012 Signal Engine — verification gate (Architecture §12 test matrix)', () => {
  it('rejects a claim whose article URL is dead (no invented substitute)', async () => {
    const { doc, text } = await src({}, 'https://labs.example.test/news/missing');
    expect(doc.retrievalStatus).toBe('http_error');
    const v = verifyClaim({ claim: claimFor(doc, { excerpt: 'Example Labs released Model X to everyone.' }), source: doc, sourceText: text, entailment: entails, verifiedAt: NOW().toISOString() });
    expect(v.support).toBe('unverified');
    expect(v.verification.checks.find((c) => c.name === 'source_retrieved_article')!.passed).toBe(false);
  });

  it('records network failures as non-ok retrievals rather than throwing', async () => {
    const { doc } = await src({ [U.modelX]: { networkError: true } }, U.modelX);
    expect(doc.retrievalStatus).toBe('network_error');
  });

  it('fails provenance when the URL is correct but the article is the wrong one', async () => {
    const { doc, text } = await src(fixturePages(), U.compute);
    const v = verifyClaim({ claim: claimFor(doc, { excerpt: 'Example Labs released Model X to all enterprise customers on November 24, 2026.' }), source: doc, sourceText: text, entailment: entails, verifiedAt: NOW().toISOString() });
    expect(v.support).toBe('unverified');
    expect(v.verification.checks.find((c) => c.name === 'excerpt_in_source')!.passed).toBe(false);
  });

  it('treats a publisher topic index page as invalid evidence', async () => {
    const { doc } = await src(fixturePages(), 'https://labs.example.test/news');
    expect(doc.retrievalStatus).toBe('not_article');
  });

  it('fails event-state qualification when a proposal is reported as enacted law', async () => {
    const { doc, text } = await src(fixturePages(), U.wireRule, WIRE);
    const v = verifyClaim({
      claim: claimFor(doc, { text: 'The Example Regulator approved a rule requiring audits.', eventState: 'approved', excerpt: 'The Example Regulator proposed a rule that would require independent audits of frontier models.' }),
      source: doc,
      sourceText: text,
      entailment: entails,
      verifiedAt: NOW().toISOString(),
    });
    expect(v.support).toBe('unverified');
    expect(v.verification.checks.find((c) => c.name === 'event_state_supported')!.passed).toBe(false);
  });

  it('fails the unit/state check when an announced purchase is treated as operational capacity', async () => {
    const { doc, text } = await src(fixturePages(), U.compute);
    const v = verifyClaim({
      claim: claimFor(doc, {
        text: 'Example Labs has 50,000 accelerators operational.',
        eventState: 'operational',
        quantities: [{ value: '50,000', unit: 'accelerators' }],
        excerpt: 'Example Labs announced an agreement to purchase 50,000 accelerators from Example Silicon.',
      }),
      source: doc,
      sourceText: text,
      entailment: entails,
      verifiedAt: NOW().toISOString(),
    });
    expect(v.support).toBe('unverified');
  });

  it('fails when a number in the claim does not appear in the excerpt', async () => {
    const { doc, text } = await src(fixturePages(), U.compute);
    const v = verifyClaim({
      claim: claimFor(doc, { text: 'Example Labs will buy 80,000 accelerators.', quantities: [{ value: '80,000', unit: 'accelerators' }], excerpt: 'Example Labs announced an agreement to purchase 50,000 accelerators from Example Silicon.', eventState: 'announced' }),
      source: doc,
      sourceText: text,
      entailment: entails,
      verifiedAt: NOW().toISOString(),
    });
    expect(v.verification.checks.find((c) => c.name === 'quantities_in_excerpt')!.passed).toBe(false);
    expect(v.support).toBe('unverified');
  });

  it('fails when the semantic support pass says the excerpt does not entail the claim', async () => {
    const { doc, text } = await src(fixturePages(), U.modelX);
    const v = verifyClaim({
      claim: claimFor(doc, { text: 'Model X outperforms every rival.', excerpt: 'Example Labs released Model X to all enterprise customers on November 24, 2026.' }),
      source: doc,
      sourceText: text,
      entailment: { verdict: 'does_not_entail', note: 'no comparison in excerpt' },
      verifiedAt: NOW().toISOString(),
    });
    expect(v.support).toBe('unverified');
  });

  it('supports a correctly quoted observed claim and marks it self-reported', async () => {
    const { doc, text } = await src(fixturePages(), U.modelX);
    const v = verifyClaim({
      claim: claimFor(doc, { text: 'Example Labs released Model X on 24 November 2026.', eventState: 'completed', excerpt: 'Example Labs released Model X to all enterprise customers on November 24, 2026.' }),
      source: doc,
      sourceText: text,
      entailment: entails,
      verifiedAt: NOW().toISOString(),
    });
    expect(v.support).toBe('supported');
    expect(v.caveat).toMatch(/Self-reported/);
  });

  it('qualifies forecasts and reported claims instead of presenting them as facts', async () => {
    const { doc, text } = await src(fixturePages(), U.compute);
    const v = verifyClaim({ claim: claimFor(doc, { text: 'Deliveries are expected to begin in 2027.', type: 'forecast', eventState: 'expected', excerpt: 'Deliveries are expected to begin in 2027.' }), source: doc, sourceText: text, entailment: entails, verifiedAt: NOW().toISOString() });
    expect(v.support).toBe('qualified');
  });
});

describe('012 Signal Engine — clustering and corroboration', () => {
  it('collapses a wire rewrite syndicated across several publishers into one event and one independent source', async () => {
    const body = ['Example Silicon said on Tuesday it will supply 40,000 accelerators to Example Labs over two years under a new multi-year agreement announced this week.', 'The agreement covers deliveries starting in 2027 and includes options for additional units according to people familiar with the matter and a company statement.'];
    const urls = ['https://a.example.test/news/silicon-deal', 'https://b.example.test/news/silicon-supply', 'https://c.example.test/news/labs-accelerators'];
    const docs: SourceDocument[] = [];
    for (const [i, url] of urls.entries()) {
      const pub = { publisher: `Outlet ${i}`, domain: new URL(url).hostname, origin: 'secondary' as const, indexPaths: [], articlePath: /^\/news\/[a-z-]+$/ };
      const titles = ['Example Silicon to supply accelerators', 'Supply deal for Example Labs', 'Accelerator agreement reported'];
      const { doc } = await retrieveSource(new FakeFetcher({ [url]: { body: article({ title: titles[i], published: '2026-11-24T10:00:00Z', paragraphs: body, url }) } }), url, pub, NOW);
      docs.push(doc);
    }
    const clusters = clusterEvents('RUN-T', docs, NOW());
    expect(clusters).toHaveLength(1);
    expect(clusters[0].independentSourceCount).toBe(1);
    expect(clusters[0].syndicationGroups[0]).toHaveLength(3);
  });

  it('keeps unrelated events apart and groups independent reports of one event', async () => {
    const pages = fixturePages();
    const docs = [
      (await src(pages, U.compute)).doc,
      (await src(pages, U.wireDeal, WIRE)).doc,
      (await src(pages, U.modelX)).doc,
      (await src(pages, U.wireRule, WIRE)).doc,
    ];
    const clusters = clusterEvents('RUN-T', docs, NOW());
    expect(clusters).toHaveLength(3);
    const deal = clusters.find((c) => c.sourceIds.length === 2)!;
    expect(deal.independentSourceCount).toBe(2);
  });

  it('marks an earlier figure superseded rather than contradicted when the stage differs', () => {
    const mk = (id: string, sourceId: string, value: string, state: Claim['eventState']): Claim => ({
      id,
      runId: 'R',
      text: `Example Labs offering of ${value} shares`,
      type: 'observed',
      eventState: state,
      entities: ['Example Labs'],
      quantities: [{ value, unit: 'shares' }],
      material: true,
      provenance: [{ sourceId, canonicalUrl: 'https://labs.example.test/news/x', publisher: 'Example Labs', retrievedAt: NOW().toISOString(), locator: 'p', excerpt: 'x' }],
      support: 'supported',
      verification: { verifierVersion: 't', verifiedAt: NOW().toISOString(), checks: [], contradictsClaimIds: [] },
    });
    const s = new Map<string, SourceDocument>([
      ['S1', { publishedAt: '2026-11-18T00:00:00.000Z' } as SourceDocument],
      ['S2', { publishedAt: '2026-11-20T00:00:00.000Z' } as SourceDocument],
    ]);
    const out = detectContradictions([mk('A', 'S1', '980,000,000', 'expected'), mk('B', 'S2', '1,127,000,000', 'completed')], s);
    expect(out[0].verification.supersededByClaimId).toBe('B');
    expect(out[0].support).toBe('qualified');
    expect(out[1].support).toBe('supported');
  });
});

describe('012 Signal Engine — prioritisation and selection', () => {
  it('holds a high-priority candidate whose critical claim is unsupported', async () => {
    const w = makeWorld({
      pages: fixturePages(),
      scripts: scripts({ 'signal.verify_support': (i) => ({ judgements: i.claims.map((x: any) => ({ claimKey: x.claimKey, verdict: /Model X/.test(x.text) && /released/.test(x.text) ? 'does_not_entail' : 'entails', note: 'fixture' })) }) }),
    });
    const run = w.repo.createRun({ publicationId: '01-ai-economy', localIssueDate: '2026-11-26', asOf: '2026-11-25T22:00:00.000Z', lookbackHours: 72, preferLastHours: 24, provider: 'scripted' });
    const eng = new SignalEngine(w.ctx);
    const { sources } = await eng.collect(run);
    const { clusters, claims } = await eng.isolateAndVerify(run, sources);
    const signals = await eng.prioritize(run, clusters, claims);
    const model = signals.find((s) => /Model X/.test(s.headline))!;
    expect(model.gate.passed).toBe(false);
    expect(model.editorialStatus).toBe('rejected');
    expect(model.rejectionReason).toMatch(/critical claim .* unverified/);
  });

  it('excludes out-of-window and index pages, and rejects a summary that introduces an untraceable number', async () => {
    const w = makeWorld({
      pages: fixturePages(),
      scripts: scripts({
        'signal.score_cluster': (i) => ({ ...(scripts()['signal.score_cluster'](i) as object), summary: `${i.cluster.title} affects 7,500 customers.` }),
      }),
    });
    const run = w.repo.createRun({ publicationId: '01-ai-economy', localIssueDate: '2026-11-26', asOf: '2026-11-25T22:00:00.000Z', lookbackHours: 72, preferLastHours: 24, provider: 'scripted' });
    const eng = new SignalEngine(w.ctx);
    const col = await eng.collect(run);
    expect(col.sources.map((s) => s.canonicalUrl).sort()).toEqual([U.compute, U.modelX, U.wireDeal, U.wireRule].sort());
    expect(col.failed.map((s) => s.retrievalStatus)).toEqual(['not_article']);
    const { clusters, claims } = await eng.isolateAndVerify(run, col.sources);
    const signals = await eng.prioritize(run, clusters, claims);
    expect(signals.every((s) => s.editorialStatus === 'rejected')).toBe(true);
    expect(signals[0].gate.reasons.join(' ')).toMatch(/7500/);
  });

  it('lets a credible weak signal advance with explicit limited evidence and applies topic diversity', () => {
    const base = (id: string, p: number, tag: string, weak = false) =>
      ({ id, candidatePriority: p, topicTags: [tag], weakSignal: weak, gate: { passed: true, blockingClaimIds: [], reasons: [] }, editorialStatus: 'candidate' }) as any;
    const out = selectSignals([base('a', 4, 'models'), base('b', 3.9, 'models'), base('c', 3.8, 'models'), base('d', 1.9, 'regulation', true), base('e', 1.5, 'capital')]);
    const acc = out.filter((s) => s.editorialStatus === 'accepted').map((s) => s.id);
    expect(acc).toEqual(['a', 'b', 'd']);
    expect(out.find((s) => s.id === 'c')!.rejectionReason).toMatch(/diversity/);
    expect(out.find((s) => s.id === 'e')!.rejectionReason).toMatch(/below threshold/);
  });
});
