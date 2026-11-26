import { sha256, newId, type SourceDocument } from '../../contracts';
import { extractArticleText, extractMetadata } from './html';
import { shingleFingerprint } from './similarity';

/** The raw HTTP layer. Tests inject a fake; production uses global fetch through the proxy. */
export interface Fetcher {
  get(url: string): Promise<{ status: number; finalUrl: string; contentType: string; body: string }>;
}

export const USER_AGENT = '012-media-research/0.1 (+https://zeroonetwo.media/method)';

export class HttpFetcher implements Fetcher {
  constructor(
    private opts: { timeoutMs?: number; maxBytes?: number; retries?: number; minIntervalMs?: number } = {},
  ) {}
  private last = 0;

  async get(url: string) {
    const retries = this.opts.retries ?? 2;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      // polite rate limit per fetcher instance
      const wait = (this.opts.minIntervalMs ?? 250) - (Date.now() - this.last);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.last = Date.now();
      try {
        const res = await fetch(url, {
          redirect: 'follow',
          headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5' },
          signal: AbortSignal.timeout(this.opts.timeoutMs ?? 20_000),
        });
        const buf = new Uint8Array(await res.arrayBuffer());
        if (buf.byteLength > (this.opts.maxBytes ?? 4_000_000)) throw new Error(`response too large (${buf.byteLength} bytes)`);
        if (res.status >= 500 && attempt < retries) {
          lastErr = new Error(`HTTP ${res.status}`);
          continue;
        }
        return { status: res.status, finalUrl: res.url || url, contentType: res.headers.get('content-type') ?? '', body: new TextDecoder().decode(buf) };
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }
}

const TRACKING_PARAMS = /^(utm_|fbclid|gclid|mc_|ref$|ref_src)/i;

export function canonicalizeUrl(raw: string): string {
  const u = new URL(raw);
  u.hash = '';
  u.hostname = u.hostname.toLowerCase();
  for (const k of [...u.searchParams.keys()]) if (TRACKING_PARAMS.test(k)) u.searchParams.delete(k);
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
  return u.toString();
}

export interface PublisherConfig {
  publisher: string;
  domain: string;
  origin: 'primary' | 'secondary';
  /** Paths that are listing/topic index pages and never valid article-level evidence. */
  indexPaths: RegExp[];
  articlePath: RegExp;
}

export interface RetrievedSource {
  doc: SourceDocument;
  text: string;
}

/**
 * Open a URL and record what it actually resolved to. Never throws for HTTP or
 * network failures: those become recorded, non-ok retrieval statuses so they
 * can block claims instead of disappearing.
 */
export async function retrieveSource(
  fetcher: Fetcher,
  url: string,
  publisher: PublisherConfig,
  now: () => Date = () => new Date(),
): Promise<RetrievedSource> {
  const retrievedAt = now().toISOString();
  const base = {
    id: newId('source'),
    requestedUrl: url,
    publisher: publisher.publisher,
    publisherDomain: publisher.domain,
    origin: publisher.origin,
    retrievedAt,
    rights: { excerptMaxChars: 320, note: 'Short attributed excerpts only; full text retained privately for verification, never republished.' },
  };
  let res: Awaited<ReturnType<Fetcher['get']>>;
  try {
    res = await fetcher.get(url);
  } catch (e) {
    return {
      text: '',
      doc: {
        ...base,
        finalUrl: url,
        canonicalUrl: canonicalizeUrl(url),
        httpStatus: 0,
        contentType: '',
        title: '',
        articleType: '',
        retrievalStatus: 'network_error',
        retrievalNote: e instanceof Error ? e.message : String(e),
        contentSha256: sha256(''),
        textLength: 0,
        shingleFingerprint: [],
      },
    };
  }
  const finalUrl = canonicalizeUrl(res.finalUrl);
  if (res.status !== 200) {
    return {
      text: '',
      doc: {
        ...base,
        finalUrl,
        canonicalUrl: finalUrl,
        httpStatus: res.status,
        contentType: res.contentType,
        title: '',
        articleType: '',
        retrievalStatus: 'http_error',
        retrievalNote: `HTTP ${res.status}`,
        contentSha256: sha256(res.body),
        textLength: 0,
        shingleFingerprint: [],
      },
    };
  }
  if (!/html/i.test(res.contentType)) {
    return {
      text: '',
      doc: {
        ...base,
        finalUrl,
        canonicalUrl: finalUrl,
        httpStatus: res.status,
        contentType: res.contentType,
        title: '',
        articleType: '',
        retrievalStatus: 'unsupported_content',
        retrievalNote: `content-type ${res.contentType}`,
        contentSha256: sha256(res.body),
        textLength: 0,
        shingleFingerprint: [],
      },
    };
  }
  const meta = extractMetadata(res.body);
  const text = extractArticleText(res.body);
  const canonical = meta.canonicalUrl ? canonicalizeUrl(new URL(meta.canonicalUrl, finalUrl).toString()) : finalUrl;
  const path = new URL(canonical).pathname;
  const isIndex = publisher.indexPaths.some((re) => re.test(path)) || !publisher.articlePath.test(path);
  const isArticleType = /article|newsarticle|report|blogposting/i.test(`${meta.ogType ?? ''} ${meta.jsonLdType ?? ''}`);
  const notArticle = isIndex || !isArticleType;
  let publishedAt: string | undefined;
  if (meta.publishedAt && !Number.isNaN(Date.parse(meta.publishedAt))) publishedAt = new Date(meta.publishedAt).toISOString();
  return {
    text,
    doc: {
      ...base,
      finalUrl,
      canonicalUrl: canonical,
      httpStatus: res.status,
      contentType: res.contentType,
      title: meta.title,
      articleType: meta.jsonLdType ?? meta.ogType ?? 'unknown',
      publishedAt,
      retrievalStatus: notArticle ? 'not_article' : 'ok',
      retrievalNote: notArticle ? `resolved to a non-article page (${isIndex ? 'index path' : `type ${meta.ogType ?? 'unknown'}`})` : undefined,
      contentSha256: sha256(text),
      textLength: text.length,
      shingleFingerprint: shingleFingerprint(text),
    },
  };
}
