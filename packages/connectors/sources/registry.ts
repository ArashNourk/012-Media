import type { Fetcher, PublisherConfig } from '../http/retrieve';

/**
 * Source registry: legitimate, machine-readable discovery endpoints (sitemaps,
 * feeds, official APIs). Each adapter yields candidate article URLs; the
 * Signal Engine opens every candidate and records what it resolves to.
 */
export interface DiscoveredUrl {
  url: string;
  /** Last-modified hint from the feed. Publication is never later than lastmod. */
  lastmod?: string;
}

export interface SourceAdapter {
  id: string;
  publisher: PublisherConfig;
  domains: string[]; // editorial domains this source contributes to
  discover(fetcher: Fetcher, windowStart: Date): Promise<DiscoveredUrl[]>;
}

export function parseSitemap(xml: string): DiscoveredUrl[] {
  const out: DiscoveredUrl[] = [];
  for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = m[1].match(/<loc>\s*([^<\s]+)\s*<\/loc>/)?.[1];
    const lastmod = m[1].match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/)?.[1];
    if (loc) out.push({ url: loc, lastmod });
  }
  return out;
}

export function sitemapAdapter(cfg: {
  id: string;
  sitemapUrl: string;
  include: RegExp;
  publisher: PublisherConfig;
  domains: string[];
}): SourceAdapter {
  return {
    id: cfg.id,
    publisher: cfg.publisher,
    domains: cfg.domains,
    async discover(fetcher, windowStart) {
      const res = await fetcher.get(cfg.sitemapUrl);
      if (res.status !== 200) throw new Error(`sitemap ${cfg.sitemapUrl} returned HTTP ${res.status}`);
      return parseSitemap(res.body).filter(
        (u) =>
          cfg.include.test(new URL(u.url).pathname) &&
          // lastmod >= published, so lastmod before the window proves the item is out of window.
          (!u.lastmod || Date.parse(u.lastmod) >= windowStart.getTime()),
      );
    },
  };
}

export const ANTHROPIC_NEWSROOM: PublisherConfig = {
  publisher: 'Anthropic',
  domain: 'www.anthropic.com',
  origin: 'primary',
  indexPaths: [/^\/news\/?$/, /^\/news\/(announcements|product|policy|partnerships|models|features|security|safeguards|societal-impacts|interpretability|alignment)\/?$/],
  articlePath: /^\/news\/[a-z0-9-]+$/,
};

/**
 * Sources reachable from the current deployment. Additional publishers
 * (wire services, regulators, filings, lab blogs) are added here as network
 * access and licences allow; see docs/ENGINE.md § Source coverage.
 */
export const DEFAULT_SOURCES: SourceAdapter[] = [
  sitemapAdapter({
    id: 'anthropic-newsroom',
    sitemapUrl: 'https://www.anthropic.com/sitemap.xml',
    include: /^\/news\/[a-z0-9-]+$/,
    publisher: ANTHROPIC_NEWSROOM,
    domains: ['models', 'agents', 'enterprise', 'capital', 'policy', 'infrastructure'],
  }),
];

export function publisherForUrl(url: string, adapters: SourceAdapter[] = DEFAULT_SOURCES): PublisherConfig | undefined {
  const host = new URL(url).hostname.toLowerCase();
  return adapters.find((a) => a.publisher.domain === host)?.publisher;
}
