# 012 MEDIA — 012 Intelligence Engine

Implementation of the private research and publishing system behind **012 MEDIA**, specified by
[`docs/012_MEDIA_Product_Vision_and_PRD_v1.1.md`](docs/012_MEDIA_Product_Vision_and_PRD_v1.1.md) (authoritative product requirements) and
[`docs/012_Intelligence_Engine_Architecture_v1.md`](docs/012_Intelligence_Engine_Architecture_v1.md) (normative technical companion).

> Status: the engine, ledger, review and publishing pipeline are implemented and tested, and one grounded dry run on live sources has reached `DRAFTED` and is awaiting editor approval (see [`docs/DRY_RUN_2026-11-26.md`](docs/DRY_RUN_2026-11-26.md)). The public website and invitation journey (PRD milestones 1–2) are **not** in this change. Nothing is deployed.

## Canonical systems

| System | Where | Responsibility |
|---|---|---|
| **012 Intelligence Method** | public framing (Method page, not built here) | `00 / SIGNAL → 01 / CONSEQUENCE → 02 / POSITION` |
| **012 Intelligence Engine** | `packages/intelligence`, `packages/orchestrator` | deterministic orchestration of the three analytical engines |
| **012 Signal Engine** (00) | `packages/intelligence/signal` | Discover → Extract → Verify → Prioritize |
| **012 Consequence Engine** (01) | `packages/intelligence/consequence` | Map → Infer → Challenge (→ one revision round) → Synthesize |
| **012 Position Engine** (02) | `packages/intelligence/position` | Evaluate → Compare → Decide → Test (14-dimension rubric internal only) |
| **012 Continuity Ledger** | `packages/intelligence/continuity` | Match → Review → Revise (append-only, editor-ratified) |
| **012 Publishing Engine** | `packages/publishing` | Approve → Render (HTML email, text, tagged PDF) → Deliver once |

Supporting packages: `packages/contracts` (Zod schemas, typed IDs, state machines), `packages/persistence` (SQLite/D1-compatible repository), `packages/connectors` (HTTP retrieval, source registry, Claude API / handoff LLM adapters, mail, object storage), `packages/review` (assembly, adversarial draft check, preflight, manifest, approval), `jobs/` (operator CLI), `migrations/`, `tests/`.

The workflow is **not** one prompt that writes a newsletter. Each stage has typed inputs and outputs, bounded and versioned model tasks, deterministic gates, and persisted, auditable records:

```
00 SIGNAL       sitemap/feed discovery → live retrieval (URL, status, canonical, dates, content hash)
                → syndication-aware clustering → atomic claim extraction (verbatim excerpts)
                → deterministic verification (excerpt-in-source, numbers-in-excerpt, event stage,
                  article-not-index, rights bound) + semantic support pass → contradiction/supersession
                → factor scoring → hard gate → weighted priority → diversity & weak-signal reserve
01 CONSEQUENCE  per-signal mechanisms → cross-signal synthesis → distinct challenge pass
                → one revision round → contract checks (accepted signals only, verified claims only,
                  numbers traceable, assumption + alternative + disconfirming indicator required)
02 POSITION     candidates → 14-dimension rubric (commercial only) → distinct adversarial review
                → PURSUE/MONITOR/DISMISS gates → duplicate guard → editorial selection
LEDGER          entity/topic matching (semantic similarity only suggests) → genuinely-new evidence
                → status proposal with condition references → ratified as an append-only revision at approval
REVIEW          compose → adversarial draft check → preflight (16 checks) → preview PDF → manifest → DRAFTED
PUBLISHING      approval locks a hashed snapshot → render from snapshot → send preflight
                → exactly-once dispatch per Toronto local date, resumable per recipient
```

## Quick start

```bash
npm install
npm test                      # 55 tests: the spec's §12 matrix + PRD negative tests
npm run typecheck
cp .env.example .env          # fill in for real runs
npm run 012                   # list operator commands
```

Daily operation (see [`docs/ENGINE.md`](docs/ENGINE.md) for the full operating guide):

```bash
npm run 012 -- prepare --date 2026-11-27 --live-links        # research → draft (or HOLD)
# editor reads var/store/review/<issue>/v<n>/source-review-manifest.md and preview.pdf
npm run 012 -- approve --issue ISS-… --editor "Name" --sha <hash prefix from manifest>
npm run 012 -- tick                                          # cron: 13:00 and 14:00 UTC, Mon–Fri
```

## What requires human or account action

- **Claude API key for the engine.** None is configured in this environment; the dry run used the recorded *session-handoff* adapter (each task answered by Claude in an operator session, then gated identically). Set `ANTHROPIC_API_KEY` and `ENGINE_PROVIDER=anthropic` for unattended research runs.
- **Source coverage / network.** This environment can reach only Anthropic's newsroom among news sources; the registry is designed for wire services, regulators, filings and other labs (`packages/connectors/sources/registry.ts`). Allow those hosts and add adapters before launch.
- **Email.** Resend account, verified sending domain (SPF/DKIM/DMARC), `RESEND_API_KEY`, publisher postal identity (`PUBLISHER_IDENTITY`, CASL). The Resend adapter is written but **not exercised against the live API**.
- **Hosting.** Object storage (R2 or equivalent) for unlisted editions, a scheduler for `tick`, a `/unsubscribe` endpoint wired to `handleUnsubscribe`. The PDF renderer needs a Node job with Chromium (not a Worker).
- **Editorial release.** Every edition requires a named editor's approval bound to the content hash.

See [`docs/ENGINE.md` § Known limitations](docs/ENGINE.md#known-limitations).
