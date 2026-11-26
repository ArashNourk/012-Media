# Deploying 012.media

**Status: not deployed.** Everything below needs account access that only the owner has.

## Shape

One Docker service (`Dockerfile`) running `npm start`:

- **Public site and access endpoints**: `apps/web` (`/`, `/brief`, `/method`, `/about`, `/privacy`, `/request`, `/verify`, `/unsubscribe`, `/e/…` for unlisted editions, and `/healthz`).
- **In-process scheduler** (`ENABLE_SCHEDULER=true`):
  - every 5 minutes it calls the send gate, which sends exactly once at 09:00 America/Toronto on weekdays, and only if the edition is approved;
  - with `ENABLE_RESEARCH=true` it also prepares the day's draft after `RESEARCH_AT`.
- **Persistent disk** at `/var/data` (`DATA_DIR`):
  - the SQLite database;
  - the private research store;
  - review artifacts;
  - rendered editions;
  - the outbox, when `MAILER=outbox`.
- **Chromium** is installed in the image for the PDF renderer.

Run **one instance only**. Two instances would mean two separate SQLite files and two schedulers.

> The Dockerfile has not been built in this environment, because no Docker daemon was available. The production start path was tested with Node directly (`NODE_ENV=production npm start`): it fails fast without its secrets, serves once they are set, redirects www to the apex domain, and sends HSTS and CSP headers.

## Render (Blueprint in `render.yaml`)

1. In Render: **New → Blueprint**, then select this repository and branch. This creates the `012-media` web service:
   - Docker runtime, Starter plan or above (a persistent disk needs a paid plan);
   - a 5 GB disk;
   - the custom domains `012.media` and `www.012.media`.
2. Set the variables marked `sync: false`:
   - `PUBLISHER_IDENTITY` — the legal entity name and postal address. Canada's anti-spam law (CASL) requires sender identification.
   - `CONTACT_EMAIL`
   - `RESEND_API_KEY`
   - `ANTHROPIC_API_KEY` — only when you turn research on.
3. Leave the three generated secrets (`FORM_SECRET`, `UNSUBSCRIBE_SECRET`, `UNLISTED_URL_SECRET`) as Render generates them. **Never rotate `UNSUBSCRIBE_SECRET` casually**: rotating it invalidates the unsubscribe links in emails already sent.
4. **DNS for 012.media**, at your registrar or DNS host: add the records Render shows for the custom domains.
   - Usually an `A` or `ALIAS`/`ANAME` record for the apex, and a `CNAME` for `www` pointing to the Render service host.
   - Render issues TLS certificates automatically once DNS resolves.
5. **Email (Resend):**
   - Add `012.media` as a sending domain.
   - Publish the SPF, DKIM and (recommended) DMARC records Resend provides.
   - Wait for verification.
   - Keep `MAIL_FROM` on that domain.
6. Deploy, then check:
   - `https://012.media/healthz` returns `ok`;
   - the home page loads;
   - a test request reaches your inbox.
7. **Operator commands** are run in Render's **Shell** tab, which uses the same disk:

   ```bash
   npm run 012 -- applications:list --status pending_review
   npm run 012 -- applications:approve --id APP-… --reviewer "Your name"
   npm run 012 -- status
   ```

## Other hosts

Any container host with a persistent volume works. Set the same variables, mount the volume at `DATA_DIR`, run one instance, and terminate TLS at the proxy with `TRUST_PROXY=true`.

Cloudflare Workers/D1 (suggested in the PRD) would need:
- a D1 adapter for the repository, which is currently synchronous `node:sqlite`;
- a separate PDF render job.

It is not used here, because one Node process keeps the site, the database, the scheduler and Chromium together.

## Backups

The disk holds the only copy of the applications, subscribers, consent records, ledger and editions. Enable Render disk snapshots, or copy `/var/data/db/012.sqlite` off the host on a schedule, for example with `sqlite3 .backup`.
