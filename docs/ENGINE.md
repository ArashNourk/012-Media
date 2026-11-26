# 012 Intelligence Engine — operating guide

Internal. Describes how the implemented system runs a weekday edition of **01 / AI ECONOMY**, what each gate does, how an editor approves, and what is known not to work yet. Terminology follows Architecture v1.0 §1.

## 1. A weekday, end to end

| When (America/Toronto) | Step | Command / job | Result |
|---|---|---|---|
| Evening before / early morning | Research run | `012 prepare --date YYYY-MM-DD --live-links` | `DRAFTED` issue + manifest + preview PDF, **or** `HELD_FOR_EVIDENCE` (quiet / failed dependency) |
| Before 09:00 | Editor review | read `source-review-manifest.md`, `preview.pdf` | approve, request revision, or hold |
| Before 09:00 | Approval | `012 approve --issue … --editor "…" --sha <prefix>` | `EDITOR_APPROVED`; continuity revisions appended; new position locked |
| 09:00 | Scheduled send | `012 tick` at 13:00 **and** 14:00 UTC | render → send preflight → dispatch once → `SENT` |

`tick` without an approved issue moves a draft to `HELD_FOR_APPROVAL`, records an alert and sends nothing. It never improvises a placeholder edition.

## 2. Gates (what blocks, and where)

**00 Signal — per claim** (`packages/intelligence/signal/verify.ts`). A claim is `unverified` unless *all* hold:
`source_retrieved_article` (HTTP 200, article page, not an index/topic page) · `provenance_matches_retrieved_url` · `excerpt_in_source` (verbatim, normalised quotes/whitespace) · `excerpt_within_rights_bound` (≤ 320 chars) · `quantities_in_excerpt` (every number in the claim appears in the excerpt) · `event_state_supported` (the excerpt expresses the asserted stage: proposed/approved/shipped/operational/…) · `semantic_support` (a separate support judgement). Forecasts, reported claims and partially entailed claims become `qualified` with a caveat; self-reported figures carry “Self-reported by <publisher>”. Cross-source claims with differing figures are marked *superseded* when stages or dates differ, otherwise *contradicted*.

**00 Signal — per candidate** (`engine.ts`): critical claims must be verified; summaries may not introduce numbers absent from verified claims; weak signals need a causal rationale. Priority = `.30 materiality + .25 decision relevance + .20 causal reach + .15 novelty + .10 source reliability` (product defaults, not validated weights); threshold 2.0; ≤ 2 per primary topic; ≤ 5 signals; one reserved slot for a credible weak signal.

**01 Consequence**: links only to accepted signals; rests only on their verified claims; needs ≥ 1 assumption, ≥ 1 competing explanation, ≥ 1 disconfirming indicator and an explicit chain; numbers traceable; a distinct challenge pass must return `pass` (one bounded revision round for `revise`). At most 3 are accepted.

**02 Position**: supporting claims and linked consequences must be verified/accepted; competitors without verified evidence are removed; PURSUE is downgraded when the adversarial review does not pass cleanly, when market/urgency/monetisation/evidence-confidence are unknown, or when evidence confidence is low; no falsifiable test → rejected; a near-restatement of a tracked thesis is routed to the ledger. The 14-dimension rubric is internal; priority is computed only when every weighted input is assessable (one decimal), and saturation / risk / confidence are caution flags, never re-added.

**Continuity Ledger**: matches by entity and topic (lexical similarity is recorded as a *suggestion* only); considers only verified claims published after the latest review and not already linked; `material_change` needs cited new claims and a legal status transition; VALIDATED/INVALIDATED need a prespecified condition (`V1…`, `I1…`); adjacent evidence is linked privately without a status change. Revisions are created only at editor approval and the database rejects UPDATE/DELETE on them; a published position's original thesis is immutable (trigger).

**Editorial preflight** (`packages/review/preflight.ts`) — blocking: records connected, claim support complete, sources are retrieved articles, no unretrieved citations in prose, live links resolve (with `--live-links`), dates (weekday; no future event dates), numbers traceable, continuity attributable, editorial grammar (1–5 signals, ≤ 3 consequences, ≤ 2 continuity), excerpt bounds, adversarial draft check, PDF preview renders with every source linked. Warnings: fewer than 3 signals, reading length, single-publisher source base, attribution language.

**Approval** (`packages/review/approval.ts`): only `DRAFTED`/`HELD_FOR_APPROVAL`; blocking preflight → refused; requires a generated manifest; binds to the content SHA-256 (`--sha` prefix guards against approving something other than what was reviewed). Any later content change voids the approval (`DRAFTED`, reapproval required).

**Publishing** (`packages/publishing`): renders only the approved snapshot after re-verifying its hash; PDF must contain text fonts and an active link for every source, or the issue goes to `FAILED_RENDER`; send preflight checks recipients (approved/subscribed, consent recorded, email verified, not suppressed), sender identification, unsubscribe; the dispatch table is unique per (publication, local date) and deliveries are unique per (dispatch, subscriber) with idempotency keys, so a partial batch resumes without duplicates. A simulated clock is refused unless the mailer is the sandbox outbox.

## 3. Analysis providers

All model work goes through `TaskRunner` (`packages/connectors/llm/runner.ts`), which hashes each task input, reuses identical recorded outputs (idempotent resume), enforces `MAX_LLM_CALLS_PER_RUN`, and records task, prompt version, provider, model/producer and input hash in `llm_calls` (shown in the manifest).

- `anthropic` — Claude API via `@anthropic-ai/sdk` `beta.messages.parse` with structured outputs from the task's Zod schema, `claude-opus-5-5` by default, adaptive thinking with per-task effort, server-side refusal fallbacks (`fallbacks: "default"`), one validation-feedback retry. Tested against a mocked client only.
- `handoff` — writes `var/handoff/<run>/<task>__<hash>.request.json` (system prompt, rendered input, JSON schema) and holds the run until `….response.json` exists (`{ "producedBy": "...", "output": {...} }`). Responses are validated and gated exactly like API outputs. Used for the 2026-11-26 dry run.

Prompts are versioned constants next to each engine (`*/tasks.ts`). Every prompt states that retrieved text is untrusted data.

## 4. Source coverage

`packages/connectors/sources/registry.ts` holds discovery adapters (sitemaps today; RSS/API adapters follow the same interface). Currently registered: **Anthropic newsroom** only, because it is the only news source reachable from this environment's network policy. Before launch, add wire services, regulators, filings (e.g. SEC EDGAR), other labs and trade press, respecting licences and robots rules, and add each host to the deployment's allowlist.

## 5. Scheduling

Configure the platform cron for **13:00 and 14:00 UTC, Monday–Friday** → `012 tick`. The Toronto-time gate opens 09:00–12:00 local; only one of the two triggers is inside the gate on any date (EDT or EST), and the unique dispatch row makes repeats harmless. Holidays are not skipped (PRD §12).

## 6. Data and rights

`var/db/012.sqlite` (SQLite; schema in `migrations/`, D1-compatible SQL), `var/store/research/sources/<sha>.txt` (full retrieved text, private, used only for verification — never republished), `var/store/review/…` (preview, manifest, preflight), `var/store/editions/…/<unlisted token>/` (approved HTML + PDF), `var/outbox/` (sandbox mail). Editions reproduce no source excerpts; the manifest shows short excerpts to the editor.

## Known limitations

1. **Single-publisher source base in this environment.** Only Anthropic's newsroom is reachable; editions built here are self-reported company news and must carry that disclosure (the engine adds it automatically). Not suitable for public release.
2. **No unattended model runs yet.** No engine API key is configured; the Claude API adapter is unit-tested with a mocked client, not live.
3. **Same analyst, several roles in the dry run.** Extraction, support judgement, synthesis and the adversarial passes were all answered in one operator session, which reduces the independence the critique passes are meant to add. With the API adapter they are separate calls with distinct prompts — still one model family.
4. **Lexical event-stage check is conservative.** It produces false negatives (e.g. past-tense verbs such as “gave”/“used” for completed events), which hold genuine claims as unverified. Precision has not been measured; see Architecture §12 evaluation programme.
5. **Clustering is lexical.** Title overlap plus shingle near-duplicates; semantically identical events with dissimilar titles will split.
6. **Number tracing ignores 0–10 and years**, and cannot detect a correct number attached to the wrong subject.
7. **Weights, thresholds and the rubric are product defaults, not validated models.**
8. **Resend adapter, R2 storage, hosted unsubscribe endpoint and alert delivery** (alerts are written to the audit log and stderr) are not deployed or tested live.
9. **Out of scope here:** public website, invitation/approval journey for readers, Method page (PRD milestones 1–2).
