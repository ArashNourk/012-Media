/**
 * Minimal, dependency-free HTML metadata and article-text extraction.
 * Retrieved content is untrusted data: it is parsed, never executed, and its
 * text is passed to analysis tasks only as quoted material.
 */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  trade: '™',
  reg: '®',
  copy: '©',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function metaContent(html: string, key: string): string | undefined {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key.replace(/[.:]/g, '\\$&')}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  if (!tag) return undefined;
  const c = tag.match(/content=["']([^"']*)["']/i)?.[1];
  return c ? decodeEntities(c).trim() : undefined;
}

export interface HtmlMetadata {
  title: string;
  canonicalUrl?: string;
  ogType?: string;
  jsonLdType?: string;
  publishedAt?: string;
  siteName?: string;
  description?: string;
}

export function extractMetadata(html: string): HtmlMetadata {
  const jsonLd = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => {
      try {
        return JSON.parse(m[1]) as Record<string, unknown>;
      } catch {
        return undefined;
      }
    })
    .filter((x): x is Record<string, unknown> => !!x);
  const ld = jsonLd.find((x) => typeof x['@type'] === 'string' && /Article|Report|Posting/i.test(String(x['@type']))) ?? jsonLd[0];
  const title =
    metaContent(html, 'og:title') ??
    (ld && typeof ld.headline === 'string' ? ld.headline : undefined) ??
    decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim();
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0]?.match(/href=["']([^"']+)["']/i)?.[1];
  const published =
    (ld && typeof ld.datePublished === 'string' ? ld.datePublished : undefined) ?? metaContent(html, 'article:published_time');
  return {
    title: title.replace(/\s+/g, ' ').trim(),
    canonicalUrl: canonical ? decodeEntities(canonical) : undefined,
    ogType: metaContent(html, 'og:type'),
    jsonLdType: ld && typeof ld['@type'] === 'string' ? String(ld['@type']) : undefined,
    publishedAt: published,
    siteName: metaContent(html, 'og:site_name'),
    description: metaContent(html, 'og:description') ?? metaContent(html, 'description'),
  };
}

const BLOCK_TAGS = /<\/(p|div|h[1-6]|li|tr|section|article|blockquote|figcaption|br)>|<br\s*\/?>/gi;

/** Plain text of the article body (falls back to <main>, then <body>). */
export function extractArticleText(html: string): string {
  let scope = html;
  const article = html.match(/<article[\s>][\s\S]*<\/article>/i)?.[0];
  const main = html.match(/<main[\s>][\s\S]*<\/main>/i)?.[0];
  scope = article ?? main ?? html.match(/<body[\s>][\s\S]*<\/body>/i)?.[0] ?? html;
  scope = scope
    .replace(/<(script|style|noscript|svg|template|iframe|form|nav|footer|aside)[\s>][\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(BLOCK_TAGS, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(scope)
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/** Normalise text for substring support checks (quotes, dashes, whitespace, case). */
export function normalizeForMatch(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
