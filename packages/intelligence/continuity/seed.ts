import { z } from 'zod';
import { ClaimType, EventState, LedgerStatus, PositionDecision, PUBLICATION_01, Quantity, stableId, type Claim, type Position } from '../../contracts';
import { retrieveSource } from '../../connectors/http/retrieve';
import { StagePendingError } from '../../connectors/llm/runner';
import { publisherForUrl } from '../../connectors/sources/registry';
import { sourceTextKey } from '../../connectors/storage/objectStore';
import type { EngineContext } from '../context';
import { VERIFY_SUPPORT } from '../signal/tasks';
import { verifyClaim } from '../signal/verify';

export const SeedFile = z.object({
  firstIdentifiedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  seedNote: z.string().min(20),
  thesis: z.string(),
  decision: PositionDecision,
  rationale: z.string(),
  targetActor: z.string(),
  decisionToConsider: z.string(),
  alternatives: z.array(z.string()),
  blocker: z.string(),
  falsificationTest: z.string(),
  reviewDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  entities: z.array(z.string()),
  topicTags: z.array(z.string()),
  validationConditions: z.array(z.string()).min(1),
  invalidationConditions: z.array(z.string()).min(1),
  initialStatus: LedgerStatus,
  evidence: z
    .array(
      z.object({
        url: z.string().url(),
        claims: z.array(
          z.object({ text: z.string(), type: ClaimType, eventState: EventState, entities: z.array(z.string()), quantities: z.array(Quantity), excerpt: z.string(), locator: z.string(), material: z.boolean() }),
        ),
      }),
    )
    .min(1),
});
export type SeedFile = z.infer<typeof SeedFile>;

/**
 * Seed an older position for continuity testing. The seed is explicitly
 * marked (seeded = true, seedNote) and never presented as a previously
 * published edition. Its evidence is retrieved live and verified through the
 * same claim gate as any other claim; a seed with unverified support fails.
 */
export async function seedPosition(ctx: EngineContext, seed: SeedFile): Promise<{ position: Position; claims: Claim[] } | { pending: true }> {
  const { repo } = ctx;
  const prior = repo.latestRun(PUBLICATION_01.id, seed.firstIdentifiedOn);
  const run = prior && prior.provider.startsWith('seed:') && prior.status === 'running' ? prior : repo.createRun({ publicationId: PUBLICATION_01.id, localIssueDate: seed.firstIdentifiedOn, asOf: `${seed.firstIdentifiedOn}T23:59:00Z`, lookbackHours: 0, preferLastHours: 0, provider: `seed:${ctx.runner.providerId}` });
  const claims: Claim[] = [];
  const items: { claim: Omit<Claim, 'support' | 'caveat' | 'verification'>; source: Awaited<ReturnType<typeof retrieveSource>> }[] = [];
  for (const ev of seed.evidence) {
    const pubCfg = publisherForUrl(ev.url, ctx.sources);
    if (!pubCfg) throw new Error(`no registered publisher for ${ev.url}`);
    const r = await retrieveSource(ctx.fetcher, ev.url, pubCfg, ctx.clock);
    if (r.doc.retrievalStatus !== 'ok') throw new Error(`seed evidence ${ev.url} not retrievable: ${r.doc.retrievalStatus}`);
    if ((r.doc.publishedAt ?? '').slice(0, 10) > seed.firstIdentifiedOn) throw new Error(`seed evidence ${ev.url} was published after ${seed.firstIdentifiedOn}`);
    await ctx.store.put(sourceTextKey(r.doc.contentSha256), r.text, 'text/plain');
    const saved = repo.upsertSource(r.doc);
    repo.linkRunSource(run.id, saved.id);
    ev.claims.forEach((c, i) =>
      items.push({
        source: { doc: saved, text: r.text },
        claim: {
          id: stableId('claim', run.id, saved.id, String(i), c.text),
          runId: run.id,
          text: c.text,
          type: c.type,
          eventState: c.eventState,
          entities: c.entities,
          quantities: c.quantities,
          material: c.material,
          provenance: [{ sourceId: saved.id, canonicalUrl: saved.canonicalUrl, publisher: saved.publisher, publishedAt: saved.publishedAt, retrievedAt: saved.retrievedAt, locator: c.locator, excerpt: c.excerpt }],
        },
      }),
    );
  }
  const bySource = new Map<string, typeof items>();
  for (const it of items) bySource.set(it.source.doc.id, [...(bySource.get(it.source.doc.id) ?? []), it]);
  let judgements;
  try {
    judgements = await ctx.runner.runAll(
      VERIFY_SUPPORT,
      [...bySource.entries()].map(([sourceId, list]) => ({
        sourceId,
        claims: list.map((x) => ({ claimKey: x.claim.id, text: x.claim.text, type: x.claim.type, eventState: x.claim.eventState, excerpt: x.claim.provenance[0].excerpt ?? '' })),
      })),
      run.id,
    );
  } catch (e) {
    if (e instanceof StagePendingError) return { pending: true };
    throw e;
  }
  const verdicts = new Map(judgements.flatMap((j) => j.output.judgements.map((x) => [x.claimKey, x] as const)));
  for (const it of items) {
    const v = verifyClaim({ claim: it.claim, source: it.source.doc, sourceText: it.source.text, entailment: verdicts.get(it.claim.id), verifiedAt: repo.now() });
    const claim = { ...it.claim, ...v } as Claim;
    if (claim.support !== 'supported' && claim.support !== 'qualified')
      throw new Error(`seed claim failed verification: "${claim.text}" — ${claim.verification.checks.filter((c) => !c.passed).map((c) => `${c.name}: ${c.detail}`).join('; ')}`);
    repo.saveClaim(claim);
    claims.push(claim);
  }
  const position: Position = {
    id: repo.reservePositionId(),
    publicationId: PUBLICATION_01.id,
    originalThesis: seed.thesis,
    linkedConsequenceIds: [],
    decision: seed.decision,
    rationale: seed.rationale,
    alternatives: seed.alternatives,
    blocker: seed.blocker,
    falsificationTest: seed.falsificationTest,
    reviewDate: seed.reviewDate,
    targetActor: seed.targetActor,
    decisionToConsider: seed.decisionToConsider,
    entities: seed.entities,
    topicTags: seed.topicTags,
    supportingClaimIds: claims.map((c) => c.id),
    validationConditions: seed.validationConditions,
    invalidationConditions: seed.invalidationConditions,
    initialStatus: seed.initialStatus,
    currentStatus: seed.initialStatus,
    firstIdentifiedOn: seed.firstIdentifiedOn,
    seeded: true,
    seedNote: seed.seedNote,
    createdAt: repo.now(),
  };
  repo.insertPosition(position, true);
  repo.updateRun(run.id, 'seeded', 'drafted', `seeded ${position.id}`);
  return { position, claims };
}
