import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AccessService, RateLimiter } from '../../packages/access/service';
import type { ObjectStore } from '../../packages/connectors/storage/objectStore';
import type { Repository } from '../../packages/persistence/repository';
import { handleUnsubscribe, verifyUnsubscribeToken } from '../../packages/publishing/unsubscribe';
import { homePage } from './views/home';
import { aboutPage, briefPage, messagePage, methodPage, notFoundPage, privacyPage, requestPage, type SpecimenLink } from './views/pages';
import type { SiteConfig } from './views/layout';
import { esc } from '../../packages/publishing/render';

const here = fileURLToPath(new URL('.', import.meta.url));
export const PUBLIC_DIR = resolve(here, 'public');

const MIME: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
  '.html': 'text/html; charset=utf-8',
};

const SITE_CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'";
// Rendered editions are self-contained documents with inline styles and no scripts.
const EDITION_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

function headers(cfg: SiteConfig, extra: Record<string, string> = {}, csp = SITE_CSP): Headers {
  const h = new Headers({
    'Content-Security-Policy': csp,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    ...extra,
  });
  if (cfg.production) h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  return h;
}

export interface SiteDeps {
  repo: Repository;
  store: ObjectStore;
  access: AccessService;
  cfg: SiteConfig;
  limits?: { applications: RateLimiter; tokens: RateLimiter };
}

export interface RequestContext {
  ip: string;
}

/**
 * The public site and its few endpoints, as a fetch-style handler. Runs under
 * the Node server in apps/web/server.ts (and in tests directly).
 */
export function createSiteApp(d: SiteDeps) {
  const { cfg, access, repo, store } = d;
  const limits = d.limits ?? { applications: new RateLimiter(6, 10 * 60_000), tokens: new RateLimiter(30, 10 * 60_000) };
  const siteOrigin = new URL(cfg.siteUrl).origin;

  const html = (body: string, status = 200, extra: Record<string, string> = {}) =>
    new Response(body, { status, headers: headers(cfg, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...extra }) });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: headers(cfg, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }) });

  function sameOrigin(req: Request): boolean {
    const url = new URL(req.url);
    const allowed = new Set([siteOrigin]);
    if (!cfg.production) allowed.add(url.origin);
    const origin = req.headers.get('origin');
    if (origin && origin !== 'null') return allowed.has(origin);
    const referer = req.headers.get('referer');
    if (referer) {
      try {
        return allowed.has(new URL(referer).origin);
      } catch {
        return false;
      }
    }
    return false;
  }

  async function readBody(req: Request): Promise<Record<string, unknown> | null> {
    const len = Number(req.headers.get('content-length') ?? 0);
    if (len > 16_384) return null;
    const text = await req.text();
    if (text.length > 16_384) return null;
    const type = req.headers.get('content-type') ?? '';
    if (type.includes('application/json')) {
      try {
        const v = JSON.parse(text);
        return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    }
    const params = new URLSearchParams(text);
    const out: Record<string, unknown> = {};
    for (const [k, v] of params) out[k] = v;
    return out;
  }

  /** Shared gate for application submissions (JSON and no-JavaScript form). */
  async function submitApplication(req: Request, ctx: RequestContext, body: Record<string, unknown>) {
    if (!sameOrigin(req)) return { status: 403, result: { ok: false as const, errors: { form: 'This request could not be verified. Reload the page and try again.' } } };
    if (!limits.applications.allow(`app:${ctx.ip}`)) return { status: 429, result: { ok: false as const, errors: { form: 'Too many requests from this connection. Please try again later.' } } };
    // Honeypot or a form submitted faster than a person could: accept silently, store nothing.
    if (typeof body.website === 'string' && body.website.trim()) return { status: 200, result: { ok: true as const, message: 'Request received.' } };
    if (!access.checkFormToken(body.formToken)) return { status: 400, result: { ok: false as const, errors: { form: 'This form has expired. Reload the page and try again.' } } };
    const consent = body.consent === true || body.consent === 'true' || body.consent === 'on';
    const r = await access.submit({ ...body, consent });
    return { status: r.ok ? 200 : 400, result: r };
  }

  function specimen(): SpecimenLink | null {
    const row = repo.db.prepare(`SELECT value FROM site_settings WHERE key = 'specimen_issue_id'`).get() as { value?: string } | undefined;
    if (!row?.value) return null;
    try {
      const issue = repo.getIssue(row.value);
      if (!issue.approvedContent || !issue.htmlKey || !issue.pdfKey) return null;
      const toUrl = (k: string) => `/e/${k.replace(/^editions\//, '').replace(/index\.html$/, '')}`;
      return { content: issue.approvedContent, htmlUrl: toUrl(issue.htmlKey), pdfUrl: toUrl(issue.pdfKey) };
    } catch {
      return null;
    }
  }

  function serveStatic(path: string): Response | null {
    const rel = path === '/favicon.svg' ? 'favicon.svg' : path.replace(/^\/assets\//, '');
    const file = normalize(join(PUBLIC_DIR, rel));
    if (!file.startsWith(PUBLIC_DIR) || !existsSync(file) || !statSync(file).isFile()) return null;
    const type = MIME[extname(file)] ?? 'application/octet-stream';
    return new Response(new Uint8Array(readFileSync(file)) as unknown as BodyInit, {
      headers: headers(cfg, { 'Content-Type': type, 'Cache-Control': rel.startsWith('fonts/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600' }),
    });
  }

  async function serveEdition(path: string): Promise<Response | null> {
    // /e/<publication>/<YYYY-MM-DD>/<24-hex token>/[file]
    const m = path.match(/^\/e\/([a-z0-9-]+)\/(\d{4}-\d{2}-\d{2})\/([a-f0-9]{24})\/([a-z0-9.-]*)$/);
    if (!m) return null;
    const file = m[4] || 'index.html';
    if (!/^(index\.html|012-ai-economy-\d{4}-\d{2}-\d{2}\.pdf)$/.test(file)) return null;
    const bytes = await store.get(`editions/${m[1]}/${m[2]}/${m[3]}/${file}`);
    if (!bytes) return null;
    return new Response(new Uint8Array(bytes) as unknown as BodyInit, {
      headers: headers(cfg, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'public, max-age=300', 'X-Robots-Tag': 'noindex, nofollow' }, EDITION_CSP),
    });
  }

  return async function handle(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/, '') || '/' : '/';
    const method = req.method.toUpperCase();
    // Canonical host: www.012.media → 012.media
    if (cfg.production && url.hostname.startsWith('www.')) {
      return new Response(null, { status: 301, headers: headers(cfg, { Location: `${siteOrigin}${url.pathname}${url.search}` }) });
    }
    try {
      if (method === 'GET' || method === 'HEAD') {
        switch (path) {
          case '/':
            return html(homePage(cfg, access.issueFormToken()));
          case '/brief':
            return html(briefPage(cfg, specimen()));
          case '/method':
            return html(methodPage(cfg));
          case '/about':
            return html(aboutPage(cfg));
          case '/privacy':
            return html(privacyPage(cfg));
          case '/request':
            return html(requestPage(cfg, { formToken: access.issueFormToken(), email: (url.searchParams.get('email') ?? '').slice(0, 254) }));
          case '/verify': {
            const token = (url.searchParams.get('token') ?? '').slice(0, 200);
            // GET never changes state (mail scanners prefetch links): the reader confirms with a button.
            return html(
              messagePage(cfg, {
                path,
                kicker: 'ACCESS REQUEST',
                title: 'Confirm your email.',
                message: 'Confirm that this address is yours to send your request for review.',
                form: `<form method="post" action="/verify" class="actions"><input type="hidden" name="token" value="${esc(token)}"><button class="btn-primary" type="submit">Confirm email</button></form>`,
              }),
            );
          }
          case '/unsubscribe': {
            const token = (url.searchParams.get('token') ?? '').slice(0, 300);
            const valid = !!verifyUnsubscribeToken(token, cfg.unsubscribeSecret);
            return html(
              messagePage(cfg, {
                path,
                kicker: 'UNSUBSCRIBE',
                title: 'Unsubscribe.',
                message: valid ? 'Stop receiving the 01 / AI Economy brief at this address. This takes effect immediately.' : 'This unsubscribe link is invalid.',
                form: valid ? `<form method="post" action="/unsubscribe" class="actions"><input type="hidden" name="token" value="${esc(token)}"><button class="btn-primary" type="submit">Unsubscribe</button></form>` : '',
              }),
              valid ? 200 : 400,
            );
          }
          case '/robots.txt':
            return new Response(`User-agent: *\nDisallow: /e/\nDisallow: /request\nDisallow: /verify\nDisallow: /unsubscribe\nSitemap: ${siteOrigin}/sitemap.xml\n`, { headers: headers(cfg, { 'Content-Type': 'text/plain; charset=utf-8' }) });
          case '/sitemap.xml':
            return new Response(
              `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['', '/brief', '/method', '/about', '/privacy'].map((p) => `<url><loc>${siteOrigin}${p}</loc></url>`).join('')}</urlset>`,
              { headers: headers(cfg, { 'Content-Type': 'application/xml; charset=utf-8' }) },
            );
          case '/healthz':
            return new Response('ok', { headers: headers(cfg, { 'Content-Type': 'text/plain' }) });
        }
        if (path.startsWith('/assets/') || path === '/favicon.svg') return serveStatic(path) ?? html(notFoundPage(cfg), 404);
        if (path.startsWith('/e/')) return (await serveEdition(url.pathname)) ?? html(notFoundPage(cfg), 404);
        return html(notFoundPage(cfg), 404);
      }

      if (method === 'POST') {
        const body = await readBody(req);
        if (!body) return path.startsWith('/api/') ? json({ ok: false, errors: { form: 'Invalid request.' } }, 400) : html(notFoundPage(cfg), 400);

        if (path === '/api/applications') {
          if (req.headers.get('x-012-form') !== '1') return json({ ok: false, errors: { form: 'Invalid request.' } }, 400);
          const r = await submitApplication(req, ctx, body);
          return json(r.result, r.status);
        }
        if (path === '/request') {
          const r = await submitApplication(req, ctx, body);
          if (r.result.ok) return html(messagePage(cfg, { path, kicker: 'ACCESS REQUEST', title: 'Request received.', message: r.result.message }));
          const values = Object.fromEntries(Object.entries(body).filter(([k]) => ['email', 'fullName', 'roleTitle', 'industry', 'linkedinUrl'].includes(k)).map(([k, v]) => [k, String(v)]));
          return html(requestPage(cfg, { formToken: access.issueFormToken(), values, errors: r.result.errors }), r.status);
        }
        if (path === '/verify') {
          if (!sameOrigin(req) || !limits.tokens.allow(`tok:${ctx.ip}`)) return html(messagePage(cfg, { path, kicker: 'ACCESS REQUEST', title: 'Not confirmed.', message: 'This request could not be verified. Open the link from your email again.' }), 403);
          const r = access.verifyEmail(String(body.token ?? ''));
          return html(messagePage(cfg, { path, kicker: 'ACCESS REQUEST', title: r.ok ? 'Email confirmed.' : 'Link expired.', message: r.message }), r.ok ? 200 : 400);
        }
        if (path === '/unsubscribe') {
          if (!limits.tokens.allow(`tok:${ctx.ip}`)) return html(notFoundPage(cfg), 429);
          // RFC 8058 one-click: POST to the List-Unsubscribe URL with List-Unsubscribe=One-Click.
          const token = String(body.token ?? url.searchParams.get('token') ?? '');
          const oneClick = body['List-Unsubscribe'] === 'One-Click';
          if (!oneClick && !sameOrigin(req)) return html(messagePage(cfg, { path, kicker: 'UNSUBSCRIBE', title: 'Not unsubscribed.', message: 'Open the unsubscribe link from your email again.' }), 403);
          const r = handleUnsubscribe(repo, token, cfg.unsubscribeSecret);
          if (oneClick) return new Response(r.ok ? 'unsubscribed' : 'invalid', { status: r.ok ? 200 : 400, headers: headers(cfg, { 'Content-Type': 'text/plain' }) });
          return html(messagePage(cfg, { path, kicker: 'UNSUBSCRIBE', title: r.ok ? 'Unsubscribed.' : 'Not unsubscribed.', message: r.message }), r.ok ? 200 : 400);
        }
        return html(notFoundPage(cfg), 404);
      }
      return new Response('Method not allowed', { status: 405, headers: headers(cfg, { Allow: 'GET, HEAD, POST' }) });
    } catch (e) {
      repo.audit('site', 'error', undefined, { path, error: e instanceof Error ? e.message : String(e) });
      return html(messagePage(cfg, { path, kicker: 'ERROR', title: 'Something went wrong.', message: 'Please try again shortly.' }), 500);
    }
  };
}
