import { stableId, type Claim, type EventCluster, type Signal, type SourceDocument } from '../../contracts';
import { retrieveSource } from '../../connectors/http/retrieve';
import type { RunRecord } from '../../persistence/repository';
import type { SourceAdapter } from '../../connectors/sources/registry';
import { sourceTextKey } from '../../connectors/storage/objectStore';
import type { EngineContext } from '../context';
import { untracedNumbers } from '../shared/numbers';
import { clusterEvents } from './cluster';
import { EXTRACT_CLAIMS, SCORE_CLUSTER, VERIFY_SUPPORT, type ScoreClusterOutput } from './tasks';
import { detectContradictions, verifyClaim } from './verify';

export const EDITORIAL_TERRITORY_01 =
  '01 / AI ECONOMY — frontier models, agents, enterprise adoption, compute, semiconductors, data centers, AI-related energy demand, AI capital, commercial outcomes and business models.';

/** Product-design defaults (Architecture §5), not empirically validated weights. */
export const SIGNAL_WEIGHTS = { materiality: 0.3, decisionRelevance: 0.25, causalReach: 0.2, novelty: 0.15, sourceReliability: 0.1 } as const;

export const SELECTION = { maxSignals: 5, minPriority: 2.0, maxPerTopic: 2, maxSourcesPerRun: 40, weakSignalReserveMinPriority: 1.8 } as const;

export class RetrievalFailure extends Error {}

export function candidatePriority(f: ScoreClusterOutput['factors']): number {
  const v =
    SIGNAL_WEIGHTS.materiality * f.materiality.score +
    SIGNAL_WEIGHTS.decisionRelevance * f.decisionRelevance.score +
    SIGNAL_WEIGHTS.causalReach * f.causalReach.score +
    SIGNAL_WEIGHTS.novelty * f.novelty.score +
    SIGNAL_WEIGHTS.sourceReliability * f.sourceReliability.score;
  return Math.round(v * 100) / 100;
}

export interface CollectResult {
  sources: SourceDocument[];
  outOfWindow: number;
  failed: SourceDocument[];
  clusters: EventCluster[];
  claims: Claim[];
}

/**
 * 012 Signal Engine (00): discover → retrieve → normalise → cluster →
 * extract atomic claims → verify → detect contradictions → score → select.
 */
export class SignalEngine {
  constructor(private ctx: EngineContext) {}

  windowFor(run: RunRecord): { start: Date; end: Date } {
    const end = new Date(run.asOf);
    return { start: new Date(end.getTime() - run.lookbackHours * 3_600_000), end };
  }

  /** discoverSources → retrieveDocuments → normalizeDatesAndURLs (idempotent per run). */
  async collect(run: RunRecord): Promise<{ sources: SourceDocument[]; outOfWindow: number; failed: SourceDocument[] }> {
    const { repo } = this.ctx;
    const linked = repo.listRunSources(run.id);
    if (linked.length) {
      return { sources: linked.filter((s) => s.retrievalStatus === 'ok'), failed: linked.filter((s) => s.retrievalStatus !== 'ok'), outOfWindow: 0 };
    }
    const { start, end } = this.windowFor(run);
    const discovered: { url: string; adapter: SourceAdapter }[] = [];
    const adapterErrors: string[] = [];
    for (const adapter of this.ctx.sources) {
      try {
        for (const d of await adapter.discover(this.ctx.fetcher, start)) discovered.push({ url: d.url, adapter });
      } catch (e) {
        adapterErrors.push(`${adapter.id}: ${e instanceof Error ? e.message : String(e)}`);
        repo.audit('signal', 'discovery.failed', run.id, { adapter: adapter.id, error: String(e) });
      }
    }
    if (adapterErrors.length === this.ctx.sources.length) throw new RetrievalFailure(`all source adapters failed: ${adapterErrors.join('; ')}`);
    repo.audit('signal', 'discovery.completed', run.id, { candidates: discovered.length, adapterErrors });

    const sources: SourceDocument[] = [];
    const failed: SourceDocument[] = [];
    let outOfWindow = 0;
    for (const { url, adapter } of discovered.slice(0, SELECTION.maxSourcesPerRun * 3)) {
      if (sources.length >= SELECTION.maxSourcesPerRun) break;
      const { doc, text } = await retrieveSource(this.ctx.fetcher, url, adapter.publisher, this.ctx.clock);
      if (doc.retrievalStatus !== 'ok') {
        const saved = repo.upsertSource(doc);
        repo.linkRunSource(run.id, saved.id);
        failed.push(saved);
        continue;
      }
      const t = doc.publishedAt ? Date.parse(doc.publishedAt) : NaN;
      if (!Number.isFinite(t) || t < start.getTime() || t > end.getTime()) {
        outOfWindow++;
        continue;
      }
      await this.ctx.store.put(sourceTextKey(doc.contentSha256), text, 'text/plain');
      const saved = repo.upsertSource(doc);
      repo.linkRunSource(run.id, saved.id);
      sources.push(saved);
    }
    repo.audit('signal', 'retrieval.completed', run.id, { inWindow: sources.length, failed: failed.length, outOfWindow });
    return { sources, outOfWindow, failed };
  }

  async sourceText(doc: SourceDocument): Promise<string> {
    const t = await this.ctx.store.getText(sourceTextKey(doc.contentSha256));
    if (t === undefined) throw new RetrievalFailure(`retrieved text for ${doc.id} is missing from the research store`);
    return t;
  }

  /** clusterEvents → extractAtomicClaims → verifyClaims → detectContradictions. */
  async isolateAndVerify(run: RunRecord, sources: SourceDocument[]): Promise<{ clusters: EventCluster[]; claims: Claim[] }> {
    const { repo, runner } = this.ctx;
    const clusters = clusterEvents(run.id, sources, new Date(run.asOf));
    clusters.forEach((c) => repo.saveCluster(c));
    const clusterOf = new Map(clusters.flatMap((c) => c.sourceIds.map((s) => [s, c.id] as const)));
    const texts = new Map<string, string>();
    for (const s of sources) texts.set(s.id, await this.sourceText(s));

    const extractions = await runner.runAll(
      EXTRACT_CLAIMS,
      sources.map((s) => ({ sourceId: s.id, url: s.canonicalUrl, publisher: s.publisher, title: s.title, publishedAt: s.publishedAt, text: texts.get(s.id)! })),
      run.id,
    );

    const draftClaims = sources.map((s, si) =>
      extractions[si].output.claims.map((x, idx) => ({
        x,
        claim: {
          id: stableId('claim', run.id, s.id, String(idx), x.text),
          runId: run.id,
          clusterId: clusterOf.get(s.id),
          text: x.text,
          type: x.type,
          eventState: x.eventState,
          entities: x.entities,
          quantities: x.quantities,
          material: x.material,
          attribution: x.attribution,
          provenance: [
            {
              sourceId: s.id,
              canonicalUrl: s.canonicalUrl,
              publisher: s.publisher,
              publishedAt: s.publishedAt,
              eventAt: x.eventAt ?? undefined,
              retrievedAt: s.retrievedAt,
              locator: x.locator,
              excerpt: x.excerpt,
            },
          ],
        },
      })),
    );

    const judgements = await runner.runAll(
      VERIFY_SUPPORT,
      sources.map((s, si) => ({
        sourceId: s.id,
        claims: draftClaims[si].map(({ claim }) => ({ claimKey: claim.id, text: claim.text, type: claim.type, eventState: claim.eventState, excerpt: claim.provenance[0].excerpt ?? '' })),
      })),
      run.id,
    );

    const now = this.ctx.clock().toISOString();
    let claims: Claim[] = sources.flatMap((s, si) => {
      const byKey = new Map(judgements[si].output.judgements.map((j) => [j.claimKey, j]));
      return draftClaims[si].map(({ claim }) => {
        const { attribution: _a, ...base } = claim;
        const v = verifyClaim({ claim, source: s, sourceText: texts.get(s.id)!, entailment: byKey.get(claim.id), verifiedAt: now });
        return { ...base, ...v } as Claim;
      });
    });

    const byId = new Map(sources.map((s) => [s.id, s]));
    for (const c of clusters) {
      const inCluster = claims.filter((x) => x.clusterId === c.id);
      const checked = new Map(detectContradictions(inCluster, byId).map((x) => [x.id, x]));
      claims = claims.map((x) => checked.get(x.id) ?? x);
    }
    claims.forEach((c) => repo.saveClaim(c));
    const counts = claims.reduce<Record<string, number>>((a, c) => ({ ...a, [c.support]: (a[c.support] ?? 0) + 1 }), {});
    repo.audit('signal', 'verification.completed', run.id, counts);
    return { clusters, claims };
  }

  /** classifyWeakSignals → prioritizeCandidates → selectSignals. */
  async prioritize(run: RunRecord, clusters: EventCluster[], claims: Claim[]): Promise<Signal[]> {
    const { repo, runner } = this.ctx;
    const sources = new Map(repo.listRunSources(run.id).map((s) => [s.id, s]));
    const eligible = clusters.filter((c) => claims.some((x) => x.clusterId === c.id && x.material && (x.support === 'supported' || x.support === 'qualified')));
    for (const c of clusters.filter((c) => !eligible.includes(c)))
      repo.audit('signal', 'cluster.ineligible', run.id, { clusterId: c.id, title: c.title, reason: 'no material claim passed verification' });
    if (!eligible.length) return [];

    const prior = repo.listPriorAcceptedSignals(run.id).slice(-40);
    const tracked = repo.listLedgerPositions(run.publicationId).map((p) => ({ positionId: p.id, thesis: p.originalThesis }));
    const inputs = eligible.map((c) => ({
      cluster: {
        id: c.id,
        title: c.title,
        independentSourceCount: c.independentSourceCount,
        sources: c.sourceIds.map((id) => {
          const s = sources.get(id)!;
          return { sourceId: s.id, title: s.title, publisher: s.publisher, publishedAt: s.publishedAt, origin: s.origin };
        }),
      },
      claims: claims
        .filter((x) => x.clusterId === c.id)
        .map((x) => ({ claimId: x.id, text: x.text, type: x.type, eventState: x.eventState, support: x.support, caveat: x.caveat, material: x.material })),
      priorCoverage: prior.map((p) => ({ signalId: p.id, headline: p.headline, eventAt: p.eventAt })),
      trackedPositions: tracked,
      editorialTerritory: EDITORIAL_TERRITORY_01,
    }));
    const scored = await runner.runAll(SCORE_CLUSTER, inputs, run.id);

    const candidates: Signal[] = eligible.map((c, i) => this.gateSignal(run, c, claims, scored[i].output, sources));
    const selected = selectSignals(candidates);
    selected.forEach((s) => repo.saveSignal(s));
    return selected;
  }

  /** Hard verification gate — more important than the weighted ranking. */
  gateSignal(run: RunRecord, c: EventCluster, claims: Claim[], o: ScoreClusterOutput, sources: Map<string, SourceDocument>): Signal {
    const own = new Map(claims.filter((x) => x.clusterId === c.id).map((x) => [x.id, x]));
    const reasons: string[] = [];
    const blocking: string[] = [];
    const used = o.claimIdsUsed.filter((id) => own.has(id));
    const foreign = o.claimIdsUsed.filter((id) => !own.has(id));
    if (foreign.length) reasons.push(`references claims outside the cluster: ${foreign.join(', ')}`);
    const critical = o.criticalClaimIds.length ? o.criticalClaimIds : used;
    for (const id of critical) {
      const cl = own.get(id);
      if (!cl) {
        blocking.push(id);
        reasons.push(`critical claim ${id} does not exist in this cluster`);
      } else if (cl.support === 'unverified' || cl.support === 'contradicted') {
        blocking.push(id);
        reasons.push(`critical claim ${id} is ${cl.support}`);
      }
    }
    const usable = used.map((id) => own.get(id)!).filter((x) => x.support === 'supported' || x.support === 'qualified');
    if (!usable.length) reasons.push('no usable verified claims');
    const evidence = usable.flatMap((x) => [x.text, ...x.quantities.map((q) => q.value)]);
    const untraced = untracedNumbers(`${o.headline} ${o.summary}`, evidence);
    if (untraced.length) reasons.push(`summary contains numbers not traceable to verified claims: ${untraced.join(', ')}`);
    if (o.weakSignal && !o.weakSignalRationale) reasons.push('weak signal flagged without causal rationale');

    const qualifications = [...o.evidenceQualifications];
    const srcs = c.sourceIds.map((id) => sources.get(id)!);
    if (c.independentSourceCount < 2) {
      const pubs = [...new Set(srcs.map((s) => s.publisher))].join(', ');
      const selfReported = o.entities.some((e) => srcs.some((s) => e.toLowerCase().includes(s.publisher.toLowerCase())));
      qualifications.push(
        selfReported
          ? `Single source: self-reported by ${pubs}; no independent corroboration retrieved.`
          : `Single publisher (${pubs}); no independent corroboration retrieved.`,
      );
    }
    for (const x of usable) if (x.verification.supersededByClaimId) qualifications.push(`An earlier figure was superseded by a later document (${x.id} → ${x.verification.supersededByClaimId}).`);

    const passed = reasons.length === 0;
    const priority = candidatePriority(o.factors);
    return {
      id: stableId('signal', run.id, c.id),
      runId: run.id,
      eventClusterId: c.id,
      headline: o.headline,
      eventAt: o.eventAt ?? undefined,
      topicTags: o.topicTags,
      entities: o.entities,
      claimIds: usable.map((x) => x.id),
      sources: c.sourceIds,
      weakSignal: o.weakSignal && !!o.weakSignalRationale,
      weakSignalRationale: o.weakSignalRationale ?? undefined,
      selectionRationale: o.selectionRationale,
      editorialStatus: passed ? 'candidate' : 'rejected',
      factors: o.factors,
      candidatePriority: priority,
      summary: o.summary,
      relevance: o.relevance,
      evidenceQualifications: [...new Set(qualifications)],
      gate: { passed, blockingClaimIds: blocking, reasons },
      rejectionReason: passed ? undefined : `held by verification gate: ${reasons.join('; ')}`,
    };
  }
}

/**
 * Ranking with constraints: hard gate first, then priority threshold, topic
 * diversity (no fake category quotas) and a reserved slot for a credible weak
 * signal. Returns every candidate with its final editorial status.
 */
export function selectSignals(candidates: Signal[]): Signal[] {
  const ranked = [...candidates].sort((a, b) => b.candidatePriority - a.candidatePriority);
  const accepted: Signal[] = [];
  const topicCount = new Map<string, number>();
  const out: Signal[] = [];
  for (const s of ranked) {
    if (!s.gate.passed) {
      out.push({ ...s, editorialStatus: 'rejected' });
      continue;
    }
    if (s.candidatePriority < SELECTION.minPriority && !(s.weakSignal && s.candidatePriority >= SELECTION.weakSignalReserveMinPriority)) {
      out.push({ ...s, editorialStatus: 'rejected', rejectionReason: `priority ${s.candidatePriority} below threshold ${SELECTION.minPriority}` });
      continue;
    }
    const topic = s.topicTags[0] ?? 'untagged';
    if ((topicCount.get(topic) ?? 0) >= SELECTION.maxPerTopic) {
      out.push({ ...s, editorialStatus: 'rejected', rejectionReason: `diversity constraint: already ${SELECTION.maxPerTopic} signals tagged "${topic}"` });
      continue;
    }
    const reserveWeak = !accepted.some((a) => a.weakSignal) && s.weakSignal;
    if (accepted.length >= SELECTION.maxSignals && !reserveWeak) {
      out.push({ ...s, editorialStatus: 'rejected', rejectionReason: 'outside the 3–5 signal editorial limit' });
      continue;
    }
    if (accepted.length >= SELECTION.maxSignals && reserveWeak) {
      const drop = accepted.pop()!;
      out.push({ ...drop, editorialStatus: 'rejected', rejectionReason: 'displaced by reserved weak-signal slot' });
    }
    accepted.push(s);
    topicCount.set(topic, (topicCount.get(topic) ?? 0) + 1);
  }
  return [...accepted.map((s) => ({ ...s, editorialStatus: 'accepted' as const })), ...out];
}
