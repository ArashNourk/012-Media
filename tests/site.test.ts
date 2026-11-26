import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createSiteApp } from '../apps/web/app';
import { createNodeServer } from '../apps/web/node';
import { AccessError, AccessService, FoundingCohortFullError, RateLimiter } from '../packages/access/service';
import { CONSENT } from '../packages/access/policy';
import { OutboxMailer } from '../packages/connectors/mail/mailer';
import { MemoryObjectStore } from '../packages/connectors/storage/objectStore';
import { openDb } from '../packages/persistence/db';
import { Repository } from '../packages/persistence/repository';
import { unsubscribeToken } from '../packages/publishing/unsubscribe';

const SITE = 'https://012.media';
const SECRET = 'test-unsubscribe-secret-0123456789';

function makeSite(o: { limit?: number } = {}) {
  const db = openDb(':memory:');
  let now = new Date('2026-11-26T15:00:00Z');
  const repo = new Repository(db, () => now);
  const dir = mkdtempSync(join(tmpdir(), '012-site-'));
  const mailer = new OutboxMailer(dir);
  const access = new AccessService(repo, mailer, { siteUrl: SITE, fromAddress: '012 MEDIA <brief@012.media>', publisherIdentity: '012 MEDIA · Test identity, Toronto', unsubscribeSecret: SECRET, formSecret: 'form-secret-test' });
  const handle = createSiteApp({
    repo,
    store: new MemoryObjectStore(),
    access,
    cfg: { siteUrl: SITE, publisherIdentity: '012 MEDIA · Test identity, Toronto', formSecret: 'form-secret-test', unsubscribeSecret: SECRET, production: true },
    limits: { applications: new RateLimiter(o.limit ?? 50, 600_000), tokens: new RateLimiter(50, 600_000) },
  });
  const mails = () => readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as { to: string; subject: string; idempotencyKey: string });
  const mailHtml = () => readdirSync(dir).filter((f) => f.endsWith('.txt')).map((f) => readFileSync(join(dir, f), 'utf8'));
  return { db, repo, access, handle, mails, mailHtml, setNow: (iso: string) => (now = new Date(iso)) };
}

const valid = (o: Record<string, unknown> = {}) => ({
  email: 'Reader@Example.com',
  fullName: 'Ada Reader',
  roleTitle: 'Partner',
  industry: 'Venture capital and investment',
  linkedinUrl: '',
  consent: true,
  consentVersion: CONSENT.version,
  ...o,
});

const tokenFrom = (text: string) => text.match(/verify\?token=([A-Za-z0-9_-]+)/)![1];

describe('access journey — service', () => {
  it('validates on the server and stores nothing for invalid input', async () => {
    const s = makeSite();
    const r = await s.access.submit(valid({ email: 'not-an-email', consent: false, linkedinUrl: 'https://evil.example/x', industry: 'Astrology' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['consent', 'email', 'industry', 'linkedinUrl']);
    expect(s.access.listApplications()).toHaveLength(0);
    expect(s.mails()).toHaveLength(0);
  });

  it('records consent wording, version and time, deduplicates case-insensitively, and sends one confirmation', async () => {
    const s = makeSite();
    const r = await s.access.submit(valid());
    expect(r.ok).toBe(true);
    const a = s.access.findByEmail('reader@example.com')!;
    expect(a).toMatchObject({ status: 'applied', consentTextVersion: CONSENT.version, emailVerifiedAt: null });
    expect(s.db.prepare('SELECT consent_text_sha256 FROM applications').get()).toBeTruthy();
    expect(s.mails()).toHaveLength(1);
    expect(s.mails()[0].subject).toMatch(/Confirm your email/);
    // same address, different case → same generic answer, no new record, no second email within 10 minutes
    const again = await s.access.submit(valid({ email: 'READER@example.COM' }));
    expect(again).toEqual(r);
    expect(s.access.listApplications()).toHaveLength(1);
    expect(s.mails()).toHaveLength(1);
  });

  it('verification tokens are single-use and expire; invalid tokens change nothing', async () => {
    const s = makeSite();
    await s.access.submit(valid());
    const token = tokenFrom(s.mailHtml()[0]);
    expect(s.access.verifyEmail('forged-token').ok).toBe(false);
    expect(s.access.findByEmail('reader@example.com')!.status).toBe('applied');
    expect(s.access.verifyEmail(token).ok).toBe(true);
    expect(s.access.findByEmail('reader@example.com')!.status).toBe('pending_review');
    expect(s.access.verifyEmail(token).ok).toBe(false);

    const t = makeSite();
    await t.access.submit(valid());
    t.setNow('2026-11-29T15:00:00Z'); // > 48 h later
    expect(t.access.verifyEmail(tokenFrom(t.mailHtml()[0])).ok).toBe(false);
    expect(t.access.findByEmail('reader@example.com')!.status).toBe('applied');
  });

  it('approval requires verification, assigns a founding seat, subscribes with the recorded consent and sends a welcome', async () => {
    const s = makeSite();
    await s.access.submit(valid());
    const app = s.access.findByEmail('reader@example.com')!;
    await expect(s.access.approve(app.id, 'Editor')).rejects.toBeInstanceOf(AccessError); // not verified
    s.access.verifyEmail(tokenFrom(s.mailHtml()[0]));
    const r = await s.access.approve(app.id, 'Editor');
    expect(r.seat).toBe(1);
    const sub = s.repo.getSubscriber(r.subscriberId)!;
    expect(sub).toMatchObject({ status: 'subscribed', consentTextVersion: CONSENT.version });
    expect(sub.emailVerifiedAt).toBeTruthy();
    expect(s.repo.listEligibleRecipients('01-ai-economy', { testOnly: false }).map((x) => x.id)).toEqual([sub.id]);
    expect(s.mails().map((m) => m.subject)).toContain('Welcome to 01 / AI Economy — 012 MEDIA');
    // re-applying after approval changes nothing and reveals nothing
    expect((await s.access.submit(valid())).ok).toBe(true);
    expect(s.access.getApplication(app.id)!.status).toBe('approved');
  });

  it('enforces the 500 founding seats transactionally — in the service and in the database', async () => {
    const s = makeSite();
    const insertApp = s.db.prepare(`INSERT INTO applications (id, email_normalized, email, full_name, role_title, industry, status, consent_text_version, consent_text_sha256, consent_at, application_date, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    const now = s.repo.now();
    s.repo.transaction(() => {
      for (let i = 1; i <= 500; i++) {
        const sub = s.repo.addSubscriber({ email: `r${i}@example.com`, publicationId: '01-ai-economy', status: 'subscribed', consentAt: now, emailVerifiedAt: now });
        insertApp.run(`APP-${i}`, `r${i}@example.com`, `r${i}@example.com`, 'R', 'R', 'Other', 'approved', 'v', 'h', now, now, now);
        s.db.prepare('INSERT INTO founding_seats (seat, subscriber_id, application_id, entitlement, granted_at) VALUES (?,?,?,?,?)').run(i, sub.id, `APP-${i}`, 'x', now);
      }
    });
    await s.access.submit(valid());
    s.access.verifyEmail(tokenFrom(s.mailHtml()[0]));
    const app = s.access.findByEmail('reader@example.com')!;
    await expect(s.access.approve(app.id, 'Editor')).rejects.toBeInstanceOf(FoundingCohortFullError);
    expect(s.access.getApplication(app.id)!.status).toBe('pending_review');
    expect(() => s.db.prepare('INSERT INTO founding_seats (seat, subscriber_id, application_id, entitlement, granted_at) VALUES (501, ?, ?, ?, ?)').run('SUB-X', app.id, 'x', now)).toThrow();
  });
});

describe('012.media — HTTP', () => {
  const get = (h: ReturnType<typeof makeSite>['handle'], path: string) => h(new Request(SITE + path), { ip: '1.1.1.1' });
  const post = (h: ReturnType<typeof makeSite>['handle'], path: string, body: unknown, headers: Record<string, string> = {}) =>
    h(
      new Request(SITE + path, {
        method: 'POST',
        headers: { origin: SITE, ...(typeof body === 'string' ? { 'content-type': 'application/x-www-form-urlencoded' } : { 'content-type': 'application/json', 'x-012-form': '1' }), ...headers },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
      { ip: '1.1.1.1' },
    );

  it('serves the exact approved copy and the publication states', async () => {
    const s = makeSite();
    const html = await (await get(s.handle, '/')).text();
    for (const t of [
      'Intelligence beyond information.',
      'From emerging signals to consequential decisions.',
      'REQUEST ACCESS',
      'Complimentary lifetime access to the core AI Economy Brief for the first 500 approved founding readers.',
      'PUBLICATIONS',
      'Distinct fields of intelligence. One rigorous method.',
      'Models, agents, enterprise adoption, computing infrastructure, industry and capital.',
      'Power, infrastructure, energy markets and resources.',
      'Trade, capital, industrial policy and global power.',
      'DAILY BRIEF',
      'COMING SOON',
    ])
      expect(html).toContain(t);
    expect(html).toMatch(/00<\/span><span class="m-sep"> \/ <\/span><span class="m-l">SIGNAL/);
    expect(html).not.toMatch(/AI Intelligence|unlock|supercharge|revolutioni[sz]e/i);
    expect((await (await get(s.handle, '/method')).text())).toContain('The 012 Intelligence Method.');
    expect((await (await get(s.handle, '/method')).text())).toContain('An evidence-first process for interpreting change, forming positions, and revisiting judgments as new information emerges.');
    expect((await (await get(s.handle, '/brief')).text())).toContain('We do not show illustrative or invented news');
  });

  it('sends strict security headers and no cookies', async () => {
    const s = makeSite();
    const r = await get(s.handle, '/');
    expect(r.headers.get('content-security-policy')).toContain("script-src 'self'");
    expect(r.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(r.headers.get('strict-transport-security')).toContain('max-age');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('set-cookie')).toBeNull();
  });

  it('accepts a valid application and rejects cross-origin, expired-form and missing-header requests', async () => {
    const s = makeSite();
    const formToken = s.access.issueFormToken(Date.now() - 5_000);
    const ok = await post(s.handle, '/api/applications', valid({ formToken }));
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { ok: boolean }).ok).toBe(true);
    expect((await post(s.handle, '/api/applications', valid({ formToken, email: 'b@example.com' }), { origin: 'https://attacker.example' })).status).toBe(403);
    expect((await post(s.handle, '/api/applications', valid({ formToken: s.access.issueFormToken(Date.now()), email: 'c@example.com' }))).status).toBe(400); // too fast
    expect((await post(s.handle, '/api/applications', valid({ formToken: 'forged.token', email: 'd@example.com' }))).status).toBe(400);
    expect((await post(s.handle, '/api/applications', valid({ formToken, email: 'e@example.com' }), { 'x-012-form': '' })).status).toBe(400);
    expect(s.access.listApplications().map((a) => a.emailNormalized)).toEqual(['reader@example.com']);
  });

  it('silently drops honeypot submissions and rate-limits bursts', async () => {
    const s = makeSite({ limit: 3 });
    const formToken = s.access.issueFormToken(Date.now() - 5_000);
    const bot = await post(s.handle, '/api/applications', valid({ formToken, website: 'http://spam.example' }));
    expect(bot.status).toBe(200);
    expect(s.access.listApplications()).toHaveLength(0);
    await post(s.handle, '/api/applications', valid({ formToken, email: 'x1@example.com' }));
    await post(s.handle, '/api/applications', valid({ formToken, email: 'x2@example.com' }));
    expect((await post(s.handle, '/api/applications', valid({ formToken, email: 'x3@example.com' }))).status).toBe(429);
  });

  it('works without JavaScript: /request form posts, errors re-render with values kept', async () => {
    const s = makeSite();
    const formToken = s.access.issueFormToken(Date.now() - 5_000);
    const bad = await post(s.handle, '/request', new URLSearchParams({ formToken, consentVersion: CONSENT.version, email: 'reader@example.com', fullName: 'Ada', roleTitle: '', industry: '' }).toString());
    expect(bad.status).toBe(400);
    const html = await bad.text();
    expect(html).toContain('value="Ada"');
    expect(html).toContain('Role or title is required.');
    const good = await post(s.handle, '/request', new URLSearchParams({ formToken, consentVersion: CONSENT.version, email: 'reader@example.com', fullName: 'Ada Reader', roleTitle: 'Partner', industry: 'Other', consent: 'on' }).toString());
    expect(good.status).toBe(200);
    expect(await good.text()).toContain('Request received.');
  });

  it('confirmation and unsubscribe links never change state on GET (mail scanners), only on POST', async () => {
    const s = makeSite();
    await s.access.submit(valid());
    const token = tokenFrom(s.mailHtml()[0]);
    expect((await get(s.handle, `/verify?token=${token}`)).status).toBe(200);
    expect(s.access.findByEmail('reader@example.com')!.status).toBe('applied');
    const r = await post(s.handle, '/verify', new URLSearchParams({ token }).toString());
    expect(r.status).toBe(200);
    expect(s.access.findByEmail('reader@example.com')!.status).toBe('pending_review');

    const app = s.access.findByEmail('reader@example.com')!;
    const { subscriberId } = await s.access.approve(app.id, 'Editor');
    const ut = unsubscribeToken(subscriberId, '01-ai-economy', SECRET);
    await get(s.handle, `/unsubscribe?token=${ut}`);
    expect(s.repo.getSubscriber(subscriberId)!.status).toBe('subscribed');
    const oneClick = await s.handle(new Request(`${SITE}/unsubscribe?token=${ut}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' }), { ip: '2.2.2.2' });
    expect(oneClick.status).toBe(200);
    expect(s.repo.getSubscriber(subscriberId)!.status).toBe('unsubscribed');
    expect(s.repo.listEligibleRecipients('01-ai-economy', { testOnly: false })).toHaveLength(0);
  });

  it('serves only well-formed edition paths and never files outside the edition store', async () => {
    const s = makeSite();
    expect((await get(s.handle, '/e/../../etc/passwd')).status).toBe(404);
    expect((await get(s.handle, '/assets/../../package.json')).status).toBe(404);
    expect((await get(s.handle, '/e/01-ai-economy/2026-11-26/000000000000000000000000/')).status).toBe(404);
  });
});

describe('012.media — browser journey (Chromium, 390 px)', () => {
  let server: ReturnType<typeof createNodeServer>;
  let base = '';
  let site: ReturnType<typeof makeSite>;
  beforeAll(async () => {
    site = makeSite();
    // The app enforces https://012.media as origin in production; for the local browser use a dev config.
    const handle = createSiteApp({
      repo: site.repo,
      store: new MemoryObjectStore(),
      access: site.access,
      cfg: { siteUrl: 'http://127.0.0.1', publisherIdentity: '012 MEDIA · Test', formSecret: 'form-secret-test', unsubscribeSecret: SECRET, production: false },
    });
    server = createNodeServer(handle, { trustProxy: false });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('email → Enter → modal with email kept → Escape keeps typed data → submit → confirmation', async () => {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(base + '/');
    await page.fill('#hero-email', 'Reader@Example.com');
    await page.keyboard.press('Enter');
    await page.waitForSelector('dialog[open]');
    expect(await page.inputValue('#f-email')).toBe('Reader@Example.com');
    expect(await page.evaluate('document.activeElement.id')).toBe('f-name');
    await page.fill('#f-name', 'Ada Reader');
    await page.keyboard.press('Escape');
    expect(await page.isVisible('dialog[open]')).toBe(false);
    expect(await page.evaluate('document.activeElement.id')).toBe('hero-email'); // focus returned
    await page.keyboard.press('Enter');
    await page.waitForSelector('dialog[open]');
    expect(await page.inputValue('#f-name')).toBe('Ada Reader'); // nothing lost
    // missing fields → server errors shown inline
    await page.waitForTimeout(2100); // form token minimum age
    await page.click('button:has-text("Submit request")');
    await page.waitForSelector('#err-roleTitle:not([hidden])');
    await page.fill('#f-role', 'Partner');
    await page.selectOption('#f-industry', 'Venture capital and investment');
    await page.check('#f-consent');
    await page.click('button:has-text("Submit request")');
    await page.waitForSelector('.apply-done:not([hidden])');
    expect(await page.textContent('[data-done-message]')).toContain('Request received');
    await browser.close();
    expect(site.access.findByEmail('reader@example.com')!.status).toBe('applied');
  });
});
