import { stableId, type EventCluster, type SourceDocument } from '../../contracts';
import { fingerprintSimilarity, overlapCoefficient, titleTokens } from '../../connectors/http/similarity';

export const SYNDICATION_THRESHOLD = 0.6;
export const TITLE_OVERLAP_THRESHOLD = 0.6;
export const CLUSTER_WINDOW_DAYS = 21;

/**
 * Deterministic event clustering.
 * 1. Near-duplicate texts (shingle similarity ≥ threshold) are syndication
 *    copies of one report: same cluster, counted once for corroboration.
 * 2. Otherwise, titles with high token overlap (publisher names excluded)
 *    published within the window describe the same underlying event.
 * Semantic similarity alone never merges events.
 */
export function clusterEvents(runId: string, docs: SourceDocument[], now: Date): EventCluster[] {
  const ok = docs.filter((d) => d.retrievalStatus === 'ok');
  const parent = new Map<string, string>(ok.map((d) => [d.id, d.id]));
  const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
  const union = (a: string, b: string) => parent.set(find(a), find(b));
  const syndicated: [string, string][] = [];
  const publisherNames = [...new Set(ok.flatMap((d) => d.publisher.toLowerCase().split(/\s+/)))];

  for (let i = 0; i < ok.length; i++) {
    for (let k = i + 1; k < ok.length; k++) {
      const a = ok[i];
      const b = ok[k];
      if (fingerprintSimilarity(a.shingleFingerprint, b.shingleFingerprint) >= SYNDICATION_THRESHOLD) {
        union(a.id, b.id);
        syndicated.push([a.id, b.id]);
        continue;
      }
      const days = Math.abs(Date.parse(a.publishedAt ?? now.toISOString()) - Date.parse(b.publishedAt ?? now.toISOString())) / 86_400_000;
      if (days > CLUSTER_WINDOW_DAYS) continue;
      const ta = titleTokens(a.title, publisherNames);
      const tb = titleTokens(b.title, publisherNames);
      if (Math.min(ta.size, tb.size) >= 3 && overlapCoefficient(ta, tb) >= TITLE_OVERLAP_THRESHOLD) union(a.id, b.id);
    }
  }

  const groups = new Map<string, SourceDocument[]>();
  for (const d of ok) {
    const r = find(d.id);
    groups.set(r, [...(groups.get(r) ?? []), d]);
  }

  return [...groups.values()].map((members) => {
    members.sort((x, y) => (x.publishedAt ?? '').localeCompare(y.publishedAt ?? ''));
    const ids = new Set(members.map((m) => m.id));
    // syndication groups via union-find restricted to syndicated edges
    const sp = new Map<string, string>(members.map((m) => [m.id, m.id]));
    const sf = (x: string): string => (sp.get(x) === x ? x : sf(sp.get(x)!));
    for (const [a, b] of syndicated) if (ids.has(a) && ids.has(b)) sp.set(sf(a), sf(b));
    const sg = new Map<string, string[]>();
    for (const m of members) sg.set(sf(m.id), [...(sg.get(sf(m.id)) ?? []), m.id]);
    const syndicationGroups = [...sg.values()].filter((g) => g.length > 1);
    // Independent corroboration = distinct publishers after collapsing syndicated copies.
    const independent = new Set([...sg.values()].map((g) => members.find((m) => m.id === g[0])!.publisherDomain)).size;
    const latest = members[members.length - 1];
    return {
      id: stableId('cluster', runId, ...[...ids].sort()),
      runId,
      title: latest.title,
      sourceIds: members.map((m) => m.id),
      syndicationGroups,
      independentSourceCount: independent,
      publisherDomains: [...new Set(members.map((m) => m.publisherDomain))],
      earliestPublishedAt: members[0].publishedAt,
      latestPublishedAt: latest.publishedAt,
    };
  });
}
