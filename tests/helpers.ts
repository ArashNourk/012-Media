/**
 * Test harness. ALL fixture documents below are synthetic, live under the
 * reserved `.test` TLD, and exist only to exercise the gates. They are never
 * used as editorial content.
 */
import type { Fetcher, PublisherConfig } from '../packages/connectors/http/retrieve';
import { TaskRunner } from '../packages/connectors/llm/runner';
import { ScriptedProvider } from '../packages/connectors/llm/scripted';
import { OutboxMailer } from '../packages/connectors/mail/mailer';
import { sitemapAdapter, type SourceAdapter } from '../packages/connectors/sources/registry';
import { MemoryObjectStore } from '../packages/connectors/storage/objectStore';
import type { EngineContext } from '../packages/intelligence/context';
import { openDb } from '../packages/persistence/db';
import { Repository } from '../packages/persistence/repository';
import { PublishingEngine, type PublishingConfig } from '../packages/publishing/engine';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface Page {
  status?: number;
  body?: string;
  finalUrl?: string;
  contentType?: string;
  networkError?: boolean;
}

export class FakeFetcher implements Fetcher {
  constructor(public pages: Record<string, Page>) {}
  requests: string[] = [];
  async get(url: string) {
    this.requests.push(url);
    const p = this.pages[url];
    if (!p) return { status: 404, finalUrl: url, contentType: 'text/html', body: '<html><body>Not found</body></html>' };
    if (p.networkError) throw new Error('ECONNRESET');
    return { status: p.status ?? 200, finalUrl: p.finalUrl ?? url, contentType: p.contentType ?? 'text/html; charset=utf-8', body: p.body ?? '' };
  }
}

export function article(o: { title: string; published: string; paragraphs: string[]; url: string; type?: string }): string {
  return `<!doctype html><html><head><title>${o.title}</title>
<meta property="og:title" content="${o.title}"><meta property="og:type" content="${o.type ?? 'article'}">
<link rel="canonical" href="${o.url}">
<script type="application/ld+json">${JSON.stringify({ '@type': o.type === 'website' ? 'WebPage' : 'NewsArticle', headline: o.title, datePublished: o.published })}</script>
</head><body><nav>Home News About</nav><article><h1>${o.title}</h1>${o.paragraphs.map((p) => `<p>${p}</p>`).join('')}</article><footer>© fixture</footer></body></html>`;
}

export function sitemap(urls: { url: string; lastmod: string }[]): string {
  return `<?xml version="1.0"?><urlset>${urls.map((u) => `<url><loc>${u.url}</loc><lastmod>${u.lastmod}</lastmod></url>`).join('')}</urlset>`;
}

export const LABS: PublisherConfig = { publisher: 'Example Labs', domain: 'labs.example.test', origin: 'primary', indexPaths: [/^\/news\/?$/], articlePath: /^\/news\/[a-z0-9-]+$/ };
export const WIRE: PublisherConfig = { publisher: 'Example Wire', domain: 'wire.example.test', origin: 'secondary', indexPaths: [/^\/news\/?$/], articlePath: /^\/news\/[a-z0-9-]+$/ };

export function adapters(): SourceAdapter[] {
  return [
    sitemapAdapter({ id: 'labs', sitemapUrl: 'https://labs.example.test/sitemap.xml', include: /^\/news/, publisher: LABS, domains: ['models'] }),
    sitemapAdapter({ id: 'wire', sitemapUrl: 'https://wire.example.test/sitemap.xml', include: /^\/news\//, publisher: WIRE, domains: ['capital'] }),
  ];
}

export function testPublishingConfig(over: Partial<PublishingConfig> = {}): PublishingConfig {
  return {
    siteUrl: 'https://012.media',
    editionBaseUrl: 'https://012.media/e',
    publisherIdentity: '012 MEDIA · Test Sender Identity, 1 Example Street, Toronto ON',
    fromAddress: '012 MEDIA <brief@012.media>',
    unsubscribeSecret: 'test-unsubscribe-secret-0123456789',
    unlistedUrlSecret: 'test-unlisted-secret',
    testRecipientsOnly: false,
    ...over,
  };
}

export const fakePdf = async (html: string) => {
  const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => `/URI (${m[1]})`).join('\n');
  return new TextEncoder().encode(`%PDF-1.7\n/Type /Page \n/Font /F1\n/StructTreeRoot\n${links}\n%%EOF`);
};

export function makeWorld(o: { pages: Record<string, Page>; scripts: Record<string, (input: any) => unknown>; now?: string; pdf?: typeof fakePdf; cfg?: Partial<PublishingConfig> }) {
  const db = openDb(':memory:');
  let now = new Date(o.now ?? '2026-11-25T22:00:00Z');
  const clock = () => now;
  const repo = new Repository(db, clock);
  const store = new MemoryObjectStore();
  const fetcher = new FakeFetcher(o.pages);
  const provider = new ScriptedProvider(o.scripts);
  const runner = new TaskRunner(provider, repo, { maxCallsPerRun: 200 });
  const ctx: EngineContext = { repo, runner, store, fetcher, sources: adapters(), clock };
  const outDir = mkdtempSync(join(tmpdir(), '012-outbox-'));
  const mailer = new OutboxMailer(outDir);
  const publishing = new PublishingEngine(repo, store, mailer, testPublishingConfig(o.cfg), o.pdf ?? fakePdf);
  return { db, repo, store, fetcher, provider, runner, ctx, mailer, publishing, outDir, setNow: (iso: string) => (now = new Date(iso)) };
}
