# 012.media launch checklist

Domain: **012.media** (product-owner correction, 26 Nov 2026; PRD v1.1 lists zeroonetwo.media). The wordmark and pronunciation (ZERO / ONE / TWO / MEDIA) are unchanged.

Items are marked **done** only when they are built and tested in this repository. **Owner** items need your accounts or decisions; nothing in this repository can complete them.

## Website and access (PRD milestones 1–2)

| Item | State |
|---|---|
| Landing page: masthead lockup; exact headline, subline and 00/01/02 row; integrated email + white REQUEST ACCESS unit; caption; PUBLICATIONS with active/coming-soon states | **done** |
| Responsive at 320, 375, 390, 430, 768, 1024 and 1440 px: no overflow, 16 px inputs, ≥ 44 px targets, one form frame, 00/01/02 on one row from 390 px (`npm run screenshots`; `docs/screenshots/`) | **done** (automated checks) |
| Application overlay: modal on desktop, bottom sheet on mobile; email carried over; Escape and backdrop keep typed data; focus returned; no-JavaScript `/request` fallback | **done** (browser test) |
| Server validation, consent text + version + hash + time, case-insensitive dedupe, no address enumeration, honeypot, signed form tokens, origin check, rate limits | **done** |
| Email confirmation: single-use 48 h tokens; GET never changes state | **done** |
| Private review CLI; 500 founding seats enforced by the database; welcome email; re-approval needs fresh consent | **done** |
| One-click unsubscribe (RFC 8058) and suppression | **done** |
| `/brief` shows a specimen only once an approved, rendered issue is set (`specimen:set`); until then it says so | **done** — **owner:** approve a publishable specimen (needs independent sources) |
| `/method` copy and safeguards; citations limited to sources the PRD names | **done** — **owner:** run `npm run 012 -- site:check-links` from a network that can reach oecd.org, gov.uk, cia.gov and cochrane.org (blocked here); confirm or drop each. The OECD 2026 horizon-scanning guide and Brier (1950) are deliberately not cited (unconfirmed / not yet applicable) |
| Privacy notice describes actual handling; retention rules implemented (`applications:purge`) | **done** — **owner:** legal review (CASL, PIPEDA), confirm the retention periods |
| Approved visual direction | **built from the PRD's written description** — **owner:** compare against the approved artwork; the reference images were not available here |

## Accounts and configuration (owner)

- [ ] Render (or another host) service from `render.yaml`; paid plan for the persistent disk
- [ ] DNS for `012.media` and `www.012.media` → host; TLS active
- [ ] Resend: `012.media` verified (SPF, DKIM, DMARC); `RESEND_API_KEY` set
- [ ] `PUBLISHER_IDENTITY` (legal entity + postal address) and `CONTACT_EMAIL`
- [ ] Disk backups
- [ ] `ANTHROPIC_API_KEY` and network access to independent sources before `ENABLE_RESEARCH=true`
- [ ] Switch `TEST_RECIPIENTS_ONLY=false` only after a staged end-to-end test with your own inbox

## Staged acceptance (PRD §16)

1. On an iPhone, submit a real request at `https://012.media`.
2. Confirm the email.
3. Run `applications:list` and `applications:approve` from the Render shell.
4. Receive the welcome email.
5. Approve a source-verified issue.
6. Receive exactly one correctly dated weekday email with the PDF link.
7. A later issue shows a correctly sourced continuity update.
