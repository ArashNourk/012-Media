# 012 MEDIA
## Product Vision & Product Requirements Document
**Implementation handoff for Claude Opus 5.5**  
**Version:** 1.1 — 23 November 2026  
**Domain:** `zeroonetwo.media`  
**Status:** Approved product direction; production implementation not yet completed.

> **Implementation instruction to Claude:** Treat this as the source of truth. Build a launchable, mobile-first, code-first product, not another speculative mockup. Preserve the approved visual identity and exact naming/copy. Implement incrementally in a single repository with working local tests, a deployment-ready configuration, and clear documentation of any provider credentials or human setup needed. Do not silently add product features, redesign the brand, call the brand “AI Intelligence,” or claim to have deployed or verified integrations without doing so. If the initial task is code creation, deliver working code rather than only another proposal. Do not use Lovable.

---

## 1. Executive product vision

**012 MEDIA** is a subject-agnostic intelligence publisher. It converts consequential developments into verified signals, interprets what those developments change, and forms evidence-grounded positions that are continually revisited as new evidence emerges.

**Brand promise:** **Intelligence beyond information.**  
**Supporting line:** **From emerging signals to consequential decisions.**  
**Method:** **00 / SIGNAL → 01 / CONSEQUENCE → 02 / POSITION.**  
**Underlying distinction:** 012 is a **living intelligence publication**, not simply a newsletter. It retains and updates its important positions, making past judgments accountable to subsequent evidence.

The customer does not buy a methodology. The reader receives a beautifully edited, exceptionally useful intelligence brief. The structured, research-informed method is the reason to trust it.

**First-reader value:** In approximately 4–6 minutes each weekday, understand what changed, why it matters, and the one commercial or strategic position that deserves attention. See how that position connects to and updates earlier assessments.

**Initial distribution value to 012:** Build a qualified, consent-based audience of founders, investors, product and strategy leaders, researchers and operators who make consequential decisions. Establish credibility and test future paid research. Subscriber counts alone do not establish demand for a paid offering.

**Business thesis:** Start with a complimentary, invitation-only founding cohort. Earn repeated attention and trust. Later validate paid subscriptions for new readers, specialized dossiers, and additional publications. Do not build monetization now.

### Non-negotiable principles

| Principle | Meaning |
|---|---|
| **Extremely minimal publicly** | One premium website, a specimen, a method page, a short application, and a morning brief. No product dashboard. |
| **Sophisticated privately** | Evidence-first ingestion, claim verification, causal synthesis, adversarial analysis, traceable judgment and continuity. |
| **Trust before automation** | Unsupported claims block publication; human approval is required initially. |
| **Subject-agnostic parent brand** | Never define 012 MEDIA itself as an AI-only company. AI Economy is its first publication. |
| **Continuity is core and free** | Updating prior positions is integral to the brief, not a separate paywalled feature. |
| **Code-first, not website-builder-first** | Single repository. No Lovable. No need to transfer the project to another AI coding assistant. |
| **Nothing fabricated** | No invented source, precise market figure, competitor capability, news event, subscriber count, endorsement or methodological validation. |

---

## 2. Brand, naming and publication architecture

The brand is written **012**, pronounced **Zero One Two** (three distinct digits: 0, 1, 2). Corporate/publisher name: **012 MEDIA**. Domain: **zeroonetwo.media**. Do not use “Alpha” as a product name, and do not call 012 “112,” “Zero Twelve,” or “Independent AI Intelligence.”

The section label on the website is **PUBLICATIONS**, never “Focus,” “Series,” or “Domains.” Each publication is a repeatable editorial product with its own subject, audience, eventual subscription terms and possible publication frequency.

| Publication | Status and cadence | Editorial territory | Exact short description |
|---|---|---|---|
| **01 / AI ECONOMY** | **DAILY BRIEF** — active, Monday–Friday | Frontier models, agents, enterprise adoption, compute, semiconductors, data centers, AI-related energy demand, AI capital, commercial outcomes and business models | **Models, agents, enterprise adoption, computing infrastructure, industry and capital.** |
| **02 / ENERGY SYSTEMS** | **COMING SOON** only | Power generation, electricity networks, storage, nuclear, fuels, energy infrastructure, resources, energy markets and economics | **Power, infrastructure, energy markets and resources.** |
| **03 / GEOECONOMICS** | **COMING SOON** only | Trade, industrial policy, sanctions, strategic supply chains, capital flows and economic leverage | **Trade, capital, industrial policy and global power.** |

These are **three complementary analytic lenses**, not a promise to launch three publications immediately. Only publication 01 is functional in MVP. Other publications must be visually disabled, not selectable subscriptions. Avoid creating empty pages or fake waitlists for them.

When an event spans several fields, assign it based on the primary question being answered, not superficial keywords. Do not duplicate the same analysis in different publications.

### Fixed brand copy

**Headline:** `Intelligence beyond information.`  
**Subline:** `From emerging signals to consequential decisions.`  
**Method:** `00 / SIGNAL    01 / CONSEQUENCE    02 / POSITION`  
**Publications section:** `PUBLICATIONS`  
**Section deck:** `Distinct fields of intelligence. One rigorous method.`

Do not replace these with generic SaaS marketing language, vague visionary copy, “AI-powered insights,” “unlock,” “supercharge,” “revolutionize,” or fabricated prestige claims.

---

## 3. Target readers, access and business model

**Primary audience:** AI founders, venture builders, professional investors and analysts, enterprise AI product/strategy leaders, and technology decision-makers. Researchers and technical specialists are valuable readers and signal contributors indirectly through their work, but a public community is not included in this release.

**Audience definition:** People with concrete decisions involving emerging technology, markets, investment or strategy—not just people enthusiastic about AI.

**Founding membership:** Up to **500 approved founding readers** receive **the core 01 / AI Economy Brief complimentary for life**. This promise does not include future specialized publications, premium dossiers, software or data products. Track membership cohort and entitlement explicitly in the database. Do not represent a fixed number of spots as remaining unless derived from actual approved records. Manual approval remains in force. Do not automatically begin charging after reader 500. Pricing requires separate validation and approval.

**No charges at launch. No paywall. No referral quotas. No invitation-for-payment schemes. No social feed.** “By invitation” means that readership is reviewed for professional relevance; it does not imply that recipients are endorsed or that applicant qualifications have been formally vetted.

---

## 4. Product scope and priorities

### P0 — Must ship for MVP

| Area | Required outcome |
|---|---|
| Website | High-fidelity mobile-first responsive landing page matching the previously approved 012 art direction |
| Publications | Correct labels, descriptions, active publication and coming-soon states |
| Invitation | Integrated hero email control → concise application overlay → email verification/consent → manual approval |
| Reader delivery | Branded welcome email and weekday editorial brief to approved, consented readers; unsubscribe works |
| Editorial content | 00 Signal / 01 Consequence / 02 Position; attractive HTML email and downloadable text-based PDF |
| Living continuity | Persistent position IDs, dated revisions, compact continuity note in subsequent editions |
| Method page | Clear research-informed method, safeguards, uncertainty treatment, credible citations and limitations |
| Editorial safety | Source-backed factual claims, manual publication approval, revision/correction workflow and fail-closed sending |
| Technical delivery | One repo, deployment documentation, environment variables, database migrations, local test suite, deployment-ready configuration |

### P1 — Useful if low complexity, not grounds to delay launch

A private operator interface or safe command-line operations for reviewing applications and approving editions; a public specimen PDF; basic delivery metrics; a simple About/contact page; responsive accessible HTML versions of released editions using unlisted URLs; operational alerts when scheduled publishing fails.

### Explicitly excluded from MVP

Public reader accounts and logins; dashboards; subscriber-specific personalized analysis; community comments; reader contributions and predictions; forecast competitions; branching graph visualization; interactive radar; referral quotas; paid plans; billing; complex search; elaborate subscriber preferences; multiple published focuses; autonomous publication of unverified research; a custom mobile app; artificial scarcity counters; stock AI imagery; decorative animations and gamification.

---

## 5. Exact landing page and editorial UX

### Approved visual direction — do not redesign

Use the **approved 012 black editorial visual** from the supplied conversation images as the source of visual truth. Matte near-black background, white/geometric modern sans-serif typography, muted neutral-gray supporting text, neon pink/magenta **only** for selected editorial accents and the active AI Economy publication. A large, restrained monochrome glowing planetary/horizon arc intrudes from the right edge on desktop, fading into black. Preserve expansive negative space and typographic authority. The arc is atmospheric, not an AI illustration. It must never impair readability or cover controls.

The masthead lockup is oversized white `012` separated by a fine vertical rule from a stacked **ZERO / ONE / TWO / MEDIA** wordmark. Navigation is sparse: **BRIEF · METHOD · ABOUT**. On mobile use a clean navigation icon/menu, not a cramped top navigation.

Use a disciplined type scale, strong rhythm and thin dividers. Avoid card-heavy SaaS patterns, gradients on buttons, excessive badges, rounded consumer-style UI, floating dashboard widgets, and stock imagery. The previously generated HTML prototype was **not accepted** as the final design; use the approved artwork and this PRD rather than treating that HTML as a design specification.

**Suggested tokens, adjustable only to achieve reference fidelity:** near-black `#080808`–`#101010`; white `#F7F7F5`; neutral gray `#A6A6A6`; magenta approximately `#FF36D1`; hairlines `#3B3B3B`. Do not use pink for the primary access button. Prefer a white button with black label and sharp/subtly rounded corners.

### Hero, above the fold

Top masthead and navigation. Then:

`Intelligence beyond information.`  
`From emerging signals to consequential decisions.`  
`00 / SIGNAL     01 / CONSEQUENCE     02 / POSITION`

Immediately beneath: **one unified email input + white REQUEST ACCESS action**, contained within a single uninterrupted form unit. No space separating the input and button, no arrow, no oversized CTA. The email input must have a useful width, and the button only as wide as its label and standard padding. Submission via Enter must work. The entire unit remains connected visually on desktop, normal iPhone sizes, and narrow screens. At the narrowest widths, a two-row arrangement is permissible **inside a single shared bordered form frame** if side-by-side layout would damage usability; never present two disconnected blocks.

Below the form, discreet caption:

`Complimentary lifetime access to the core AI Economy Brief for the first 500 approved founding readers.`

No extra sales pitch, inflated claims or fictitious social proof.

### Publications section, on same landing page

Heading: `PUBLICATIONS`  
Deck: `Distinct fields of intelligence. One rigorous method.`

Three editorial columns on desktop, three vertically stacked sections on mobile. Active publication is accented in magenta, inactive are soft gray. Use thin rules rather than cards.

`01 / AI ECONOMY` — `DAILY BRIEF`  
`Models, agents, enterprise adoption, computing infrastructure, industry and capital.`

`02 / ENERGY SYSTEMS` — `COMING SOON`  
`Power, infrastructure, energy markets and resources.`

`03 / GEOECONOMICS` — `COMING SOON`  
`Trade, capital, industrial policy and global power.`

### Mobile-first exact behaviors

Design at **320, 375, 390, 430, 768, 1024 and 1440 px** widths. Layout must not have horizontal overflow, overlap or clipped text. The `012` lockup remains legible. Hero text scales and wraps naturally. Keep `00/01/02` in one legible row on a normal 390 px iPhone; gracefully wrap or stack at narrower widths without tiny text. The email control is usable one-handed with **16px or larger input text** to prevent iOS focus zoom; tap targets at least ~44px high. The publications become distinct full-width editorial rows; `COMING SOON` remains visibly secondary. The planetary arc shrinks and fades behind content, never reducing contrast. Honor reduced motion; avoid unnecessary animations.

The source HTML must be accessible and semantic, not a screenshot or an image pretending to be a website. Navigation, form, validation, modal, and emails must work.

### Brief, Method, About routes

`/`: main landing page and invitation journey.  
`/brief`: one **real**, verified specimen issue (HTML preview with linked downloadable PDF). Specimen publicly viewable. No fabricated news or dummy claims published as real.  
`/method`: research methodology, lineage and limitations, citations to academic/official sources.  
`/about`: restrained editorial purpose and contact; do not invent founder bios, teams, partnerships or credentials.  
`/privacy`, `/terms` if needed, `/unsubscribe` (provider-backed or verified endpoint), and `/request-status`/success state as appropriate.

Keep all pages visually consistent, lightweight and editorial. Avoid building a public archive UI or platform navigation.

---

## 6. Invitation journey and reader lifecycle

### Reader states

`new` → `application_started` (ephemeral) → `applied` → `email_verified` → `pending_review` → `approved` or `declined` / `waitlisted` → `subscribed` → optionally `unsubscribed`, `bounced`, `suppressed`.

Only fully approved subscribers with valid consent and verified deliverable email are eligible for publication delivery. Rejection does not automatically create a marketing subscriber. Re-approval of an unsubscribed reader requires current consent. Deduplicate case-insensitively.

### Experience sequence

**Step 1 — Landing hero.** Visitor types email and presses the integrated white **REQUEST ACCESS** control. Validate on client and server. The email value persists into step 2. Do not subscribe or send promotional email at this stage.

**Step 2 — Short application overlay.** Accessible modal on desktop, bottom sheet or well-designed modal on mobile. Fields: email (prefilled, editable if needed), full name, professional role/title, industry (small select), optional LinkedIn URL. **Do not require a justification essay.** Include clearly worded, initially unchecked express consent checkbox and link to privacy notice. Controls: `Submit request`, `Close`. Escape/backdrop behavior should not delete typed information unexpectedly. Form must not be a fake visual prototype.

**Step 3 — Submitted.** Confirmation says the request has been received and is subject to review; no false promise of approval or invented review SLA. A verification message confirms email ownership when configured. Do not expose invite list counts or applicant details.

**Step 4 — Review.** Operator reviews applications for professional relevance using a secure **private** tool (lightweight admin-only page or CLI). Public readers have no accounts or dashboard. Audit each approval/decline with timestamp. Avoid discriminatory or arbitrary claims of merit. The 500-founding-reader maximum is enforced on approval, transactionally, not via a decorative counter.

**Step 5 — Approval.** Subscriber receives short branded welcome email explaining Focus 01, weekday delivery around 9 AM Toronto time, where to find a specimen, how to unsubscribe, and the free-for-life scope. Only approved/consented readers are added to the live delivery audience.

**Step 6 — Delivery.** Every weekday at 9 AM Toronto, send concise HTML email with main thesis and link to the new editorial PDF. Emails display true publication date; links must be tested. Support unsubscriptions and delivery suppression.

**Step 7 — Corrections and unsubscribing.** An issue correction is marked with date and rationale. Material corrections are disclosed to affected recipients. Unsubscribe immediately suppresses further broadcasts.

### Referral policy

No public referral mechanics, “three invitations” slots, LinkedIn OAuth, invitations to paid plans, or bonuses. Optional direct forwarding of public specimen is enough. LinkedIn is an optional URL field; no LinkedIn authentication is required.

### Privacy and consent

Store only information needed for approval and distribution. Log what consent language the applicant accepted and when. Do not add step-1 email addresses to the marketing list or contact abandoned applicants absent appropriate permission. Establish retention/deletion rules, applicant access/deletion path, and secure handling of personal LinkedIn URLs. The Canadian CASL baseline includes consent, sender identification/contact information, and a functioning unsubscribe mechanism. Obtain legal review before launch where required.

---

## 7. Daily report: fixed product format

**Public cadence:** Monday through Friday at **9:00 AM America/Toronto** (DST-safe). **Private research cadence:** daily/as sources warrant. The prior personal ChatGPT daily report is a conceptual prototype, not a safe production source and must not be assumed to be production-integrated.

**Reading time:** 4–6 minutes. The daily publication is a concentrated editorial brief, not a long dashboard or a mandated inventory of 12 ideas.

### Required editorial grammar

| Section | Typical volume | Content |
|---|---|---|
| **Cover/editorial thesis** | One headline and short lead | Most consequential change and why this edition matters |
| **00 / SIGNAL** | **3–5** verified high-signal developments, fewer on quiet days | Actual event, original source/event date, factual summary, relevance, source link, evidence qualifications |
| **01 / CONSEQUENCE** | **2–3** synthesized implications | Mechanism of change, stakeholders, first/second-order effects, alternatives, uncertainty, temporal horizon |
| **02 / POSITION** | **One** strategic or commercial position | What warrants action/monitoring, target actor or buyer, evidence, alternative explanations, named competitors when applicable, risk and first falsifiable test |
| **CONTINUITY** | **One compact thread**, occasionally two | Update to an earlier tracked position; original ID/date, status change, specific new evidence, link back |
| **Sources/corrections** | Compact, complete | Clickable primary articles/reports, corrections and issue revision state |

**No obligation to create a new business idea every day.** Some editions may revisit an existing opportunity, or conclude “monitor/no action.” Do not invent commercial white space or an arbitrary scoring change to fill a template.

### Reader-facing content priorities

Start with insight rather than source volume. Preserve distinct source evidence and editorial inference. Reference original articles rather than generic topic indexes. Distinguish an announcement, proposal, forecast, analyst claim, completed investment and verified outcome. Links must open the real intended page. Never reuse invalid, fabricated or stale citations from previous prototype editions.

**Email:** Beautifully typeset, short HTML with the edition thesis, 00/01/02 snapshot, one continuity line, and one clear `Read the full brief` link. Do not require a PDF attachment to every email; host the accessible PDF and link it. Make the email useful without the download.

**PDF:** Branded, text-selectable, searchable and accessible editorial publication. Dynamic length, generally ~2–5 pages when needed. Typography, whitespace, working original-source hyperlinks, coherent page breaks and legal/footer details. Generate from the same approved structured edition record as the email. Do not produce screenshot-only PDFs.

**HTML specimen:** Same structured content rendered responsively. No fake news used as real sample.

---

## 8. The 012 Intelligence Method and Intelligence Engine: research and operational requirements


### Canonical names and normative implementation reference

- **012 Intelligence Method** — public research framework and epistemic commitments.
- **012 Intelligence Engine** — internal operational research system implementing three stages: **012 Signal Engine** (00), **012 Consequence Engine** (01), **012 Position Engine** (02).
- **012 Continuity Ledger** — cross-edition intelligence memory, not a numbered fourth stage.
- **012 Publishing Engine** — edition rendering, PDF, email and distribution, not research or inference.

**The companion file `012_Intelligence_Engine_Architecture_v1.md` is a normative implementation specification.** Read it alongside this PRD before writing the intelligence workflow. It defines the engine contracts, individual algorithms and scaffolding, evidence verification gates, priority models, continuity logic, state transitions, operational tests and minimum real-source end-to-end demonstration. If either document is absent, do not invent an engine from marketing descriptions; request the missing specification. Where editorial facts and product constraints conflict, the present PRD controls; where engine implementation details are unspecified here, use the companion architecture.

**Prototype caveat:** Past ChatGPT daily editions were produced through an evolving assistant-driven research process, not fixed production algorithms. Reuse the established editorial logic without inheriting unverified past claims or implying scientific validation.

The method is **research-informed, not yet scientifically validated as a proprietary system**. Its credibility depends on repeated source-checking, clear uncertainty, evidence tracking, archived revisions and measurable evaluation. The public Method page must explain this without marketing overclaim.

### Stage 00 — SIGNAL: disciplined evidence extraction

**Inputs:** Curated primary-company/lab releases, official research papers, credible journalism, public filings, regulatory notices, earnings transcripts, industry reports, patents and technical standards, accessed through legitimate feeds/APIs/search sources. Respect publisher terms, robots, copyright and rate limits. Do not scrape paywalled content without access rights.

**Pipeline:** Discover → normalize → timestamp → deduplicate → cluster related articles by underlying event → identify original documents → extract atomic factual claims → attach provenance → independently check consequential claims → rank for materiality and novelty → approve candidate signals.

**Research record:** Source URL/publisher/publication date; event date; retrieval timestamp; original vs secondary; the claim text; supporting excerpt/section pointer; support status; contradiction flag; research-system version; topical tags; reason for selection.

**Gate:** No material fact is published unless verified from accessible evidence that actually supports it. A link merely existing is not evidence. If support is missing, label uncertainty, seek a second source or reject the claim. Numerical assertions must distinguish planned/authorized/shipped/installed/operating quantities. Preserve distinction between what happened and what somebody says might happen.

**Weak-signal assessment:** In addition to relevance, tag emerging/weak signals when low-visibility but plausible developments may have disproportionate implications. “Weak signal” is an analytical category, not evidence of predictive power. Rank using explicit transparent factors such as source quality, significance, causal reach, novelty and decision relevance. Do not equate a surprising headline with a consequential signal.

### Stage 01 — CONSEQUENCE: causal synthesis and strategic foresight

**Inputs:** Verified signals, historical observations and previously tracked positions.

**Pipeline:** Identify causal mechanism → affected actors and economic incentives → enabling constraints → first- and second-order consequences → baseline/counterfactual interpretation → competing explanations → assumptions and timing → disconfirming indicators → concise synthesis.

**Gate:** An implication must state *why* it follows from the facts, what assumptions are required and how it could be wrong. No unsupported certainty about market outcomes. Use explicit tags `observed`, `reported claim`, `inferred` and `forecast/hypothesis` internally; public prose should communicate these distinctions naturally.

### Stage 02 — POSITION: calibrated editorial judgment

**Inputs:** Consequence hypotheses, competitive evidence, buyer/user context where available, historical position revisions.

**Outputs:** One position per issue, `PURSUE`, `MONITOR` or `DISMISS` (or equivalent concise editorial verdict) with target actor, decision, rationale, competing alternatives, key risks, evidence confidence, next validation action and conditions for changing the verdict.

For a commercial product thesis include a recognizable buyer, concrete problem, present alternatives/competitors, business model hypothesis, why now, reachable distribution, likely MVP and the smallest credible paid-demand test. Competitor names and assertions require actual evidence. Being in a crowded market is not itself grounds for dismissal; execution quality, economics and differentiation matter.

**Optional internal 14-factor rubric** for commercial opportunity analysis; never force the full score table into every public issue. Scores are judgments, not empirical facts. The original highly personalized factor “founder fit” must **not** be publicly presented as universal. If applicable, define a named operator archetype and score its execution fit; otherwise omit it rather than quietly substitute. Dimensions: execution fit, market attractiveness, market saturation, urgency, monetization, reachable market/growth, differentiation, distribution, MVP feasibility, capital efficiency, scalability, timing, execution/regulatory risk and evidence confidence. Saturation/risk: lower is better; other factors higher is better. The established weighted internal commercial-priority formula is 20% operator/founder fit, 20% market attractiveness, 10% urgency, 10% monetization, 10% differentiation, 10% distribution, 10% MVP feasibility, 5% capital efficiency, 5% scalability. Saturation, execution risk and confidence are explicit caution/override factors and must not be double-counted; reachable-market/growth and timing are assessed separately. Do not print meaningless multi-decimal precision.

**Editorial gate:** Separate an observed consequence from an investable opportunity. Do not imply willingness to pay or market white space has been validated until customer evidence exists. A good decision can be “no action.”

### Cross-cutting controls

**Provenance:** Every substantive fact has a source pointer; every major inference references the facts/assumptions it depends upon.

**Adversarial check:** For high-impact conclusions, a separate critique pass challenges causal claims, competing explanations, missing evidence and whether the next test can falsify the thesis. This does not prove correctness.

**Human release authority:** Initially, an editor must affirm factual quality, continuity correctness, citations, PDF/email rendering and release. No unattended mass-mail dispatch of unreviewed AI text.

**Reproducibility:** Store the prompt/template versions, model versions, fetch timestamps, final structured records and editorial changes, while protecting sensitive credentials and source material.

**Copyright:** Paraphrase rather than reproduce significant portions of articles; display short attributed excerpts only when justified and permitted; keep original links.

---

## 9. Living intelligence: continuity model (CORE FREE FEATURE)

Continuity is the only enhanced intelligence feature in MVP. **No interaction, prediction market, community, graph or dashboard.** Its job is to let a reader understand what became of important earlier judgments.

### Core behavior

Every consequential `Position` gets a persistent ID, e.g. `POS-000042`; original date/edition and an immutable initial thesis. Every later material update becomes a separate `PositionRevision`, linked to exact new evidence, prior status, new status, and a brief reason. The previous judgment is never silently overwritten.

**Allowed status labels:** `EMERGING`, `STRENGTHENING`, `STABLE`, `WEAKENING`, `VALIDATED`, `INVALIDATED`, `UNRESOLVED` and `RETIRED` (internally). The public brief should display only useful, clearly explained status changes. Validation must refer to **specified thesis conditions**, not general market growth. Use no opaque one-number “continuity score.”

A position should be reviewed when material new evidence arrives, a prespecified milestone becomes due, a major competitor action changes feasibility, or an editorial review date arrives. Not every position needs an update daily. Do not invent changes just to create movement.

### Reader-facing continuity example (ILLUSTRATIVE, not news)

`CONTINUITY / POS-000042 — STRENGTHENING`  
`First identified 12 Nov. New independent evidence supports the adoption thesis; commercial demand remains unverified.`  
`Read the original position →`

Keep the continuity thread visually small and readable. An update can link to an earlier downloadable issue or a lean unlisted HTML history page; do not build a public graph. Recipients may forward unlisted links: invitation access controls distribution, **not** perfect secrecy.

### Continuity decision logic

Persist source/entity/event relationships to detect when a new development touches an existing position. Produce candidate revision suggestions, then require evidence-based comparison of old vs new. Only publish revisions that change a thesis, timing, evidence confidence or action recommendation materially. Store date, trigger, new source IDs, old and new judgment, rationale and editor identity. Do not generate a new Position if the new evidence merely extends an existing one.

The background record should support later longitudinal evaluation, but **do not build forecast leaderboards, probabilistic scoring or user submissions in MVP**.

---

## 10. Public Method page: exact intellectual framing

**Hero title:** `The 012 Intelligence Method.`  
**Lead:** `An evidence-first process for interpreting change, forming positions, and revisiting judgments as new information emerges.`

Explain 00 Signal, 01 Consequence and 02 Position as separately checkable disciplines. Include a clear “Living Intelligence” section describing persistent positions and dated updates; describe editorial release safeguards, uncertainties, provenance and correction policy. Do not expose implementation secrets, fabricate a formal peer review, or claim mathematical certainty. Avoid the word “scientifically proven” unless independently validated.

**Precisely describe the academic relationship:** 012 adapts and operationalizes principles associated with horizon scanning, strategic foresight, structured analytical reasoning, falsifiable hypotheses and living evidence surveillance. It is not itself a published, experimentally validated scientific instrument. These sources are foundational references **for principles**, not endorsements of 012:

1. OECD, *Strategic Foresight* — https://www.oecd.org/en/about/programmes/strategic-foresight.html
2. OECD, *Building Capacity in Technology Horizon Scanning: A Guide for Policymakers* (2026) — locate and link official OECD document; confirm title/version before publication.
3. UK Government Office for Science, *The Futures Toolkit* — https://www.gov.uk/government/publications/futures-toolkit-for-policy-makers-and-analysts/the-futures-toolkit-html
4. Richards J. Heuer Jr., *Psychology of Intelligence Analysis*, CIA Center for the Study of Intelligence — https://www.cia.gov/resources/csi/books-monographs/psychology-of-intelligence-analysis-2/
5. Cochrane Handbook, *Chapter 21: Living Systematic Reviews* — https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-21
6. G. W. Brier (1950), *Verification of Forecasts Expressed in Terms of Probability* — https://journals.ametsoc.org/view/journals/mwre/78/1/1520-0493_1950_078_0001_vofeit_2_0_co_2.xml — relevant only if probabilistic forecasting evaluation is later introduced, **not a claim that launch issues are statistically validated**.

If a source is unavailable or does not directly support a specific methodological claim, remove or qualify that claim. The Method page should make the actual method inspectable, not rely on a long list of impressive-looking citations.

---

## 11. Content and data model (reference schema)

Implement in a minimal relational schema with migrations, stable IDs and timestamps. Naming below is illustrative but relationships and safety properties are required.

| Entity | Essential fields and relationships |
|---|---|
| `Source` | id, canonical_url, title, publisher, type, published_at, retrieved_at, retrieval_status, rights/usage metadata |
| `Claim` | id, atomic_text, claim_type, source_id, supporting_locator/excerpt, verification_status, review_note, timestamp |
| `Signal` | id, title, event_at, category, materiality, verified_claim_ids, source_ids, duplicate_cluster_id, editorial_status |
| `Consequence` | id, thesis, causal_mechanism, linked_signal_ids, affected_actors, assumptions, alternatives, evidence_confidence, revision |
| `Position` | stable_id, thesis, focus_id, initial_issue_id, initial_status, current_status, target_actor, action, invalidation_conditions, next_review_at |
| `PositionRevision` | id, position_id, issue_id, previous_status, new_status, rationale, new_source_ids, new_claim_ids, editor_id, created_at; append-only |
| `Issue` | id, publication_id, local_issue_date, edition_number, final_headline, selected_signal_ids, consequence_ids, position_id, continuity_revision_ids, version, status, approved_at, sent_at, pdf_key, email_payload_hash |
| `Application` | id, email_normalized, name, role, industry, linkedin_optional, status, verification, consent_text_version, consent_at, application_date, reviewer, review_date |
| `Subscriber` | id, email, publication_id, founding_cohort, access_entitlement, consent status, delivery status, unsubscribe/bounce status |
| `Delivery` | id, issue_id, subscriber_id or provider_batch_id, status, provider_message_id, attempts, last_event_at |
| `Job/Audit` | id, scheduled_for, step, version, status, error, replay_key, operator, created_at |

Use unique constraints to avoid duplicate issue send, duplicate applications and duplicate founding entitlements. Published issues and revisions must support versioning and corrections. Treat scraped/retrieved page content as untrusted text; it must not issue commands to the model or override the editorial policy. Never store API keys in issue or claim records.

---

## 12. Technical architecture and operations

**Required approach:** One codebase, conventional source-controlled project, no Lovable, no separate no-code builder. TypeScript-first is preferred for the website, APIs and structured publishing tasks, with an isolated PDF renderer if needed. Build a reproducible local environment plus production deployment instructions. No vendor lock-in beyond pragmatic API adapters.

**Suggested deployment, subject to actual platform compatibility and tests:** Cloudflare for website/API, scheduled workers, lightweight database (D1) and object storage (R2); a transactional/broadcast email provider such as Resend; reputable search/source APIs; selected LLM API(s) for research assistance. These are suggestions, not justification for expanding architecture. If the PDF generation stack is incompatible with Workers, keep a small isolated build/render job in the **same repository**; document its hosting plainly. Do not pretend one runtime supports every required library without testing.

**Timezone:** Cloudflare Cron runs in UTC, so do not hardcode “9AM Toronto = 14:00 UTC” all year. Handle DST with timezone-aware scheduling/idempotent local-time gating. A scheduler may run at both possible UTC slots and must dispatch **exactly once per local Monday–Friday date**, after successful release approval. Holidays are not skipped unless policy changes.

**Editorial processing:** A separate collect/analyze draft job can run ahead of publication. Produce a validated draft, render PDF and email preview, run automated content checks and make it available for editor approval. At the scheduled send time, send **only** an approved finalized issue. If not approved, hold the send, alert the editor, and never improvise a placeholder newsletter. Repeated job invocations must not send duplicates.

**Email:** Verified sending domain with SPF/DKIM/DMARC, honest From identity, accessible HTML and plain-text alternative, visible publisher address/identification, working unsubscribe, bounce suppression and idempotent broadcast sends. Use source/provider APIs only after credentials are configured. Secrets remain server-side.

**PDF:** Prefer a tested HTML-to-PDF or PDF-render library producing selectable text and active links. Do not use image-only exports. Validate page breaks, metadata, rendering and accessible heading structure. Host in R2 or equivalent and use stable unlisted URLs. No requirement to create a full member archive.

**Security:** Validate input on server; rate-limit bot/spam invitation submissions; normalize emails; CAPTCHA only if abuse justifies the friction; protect approval operations, database and source credentials; avoid leaking subscriber emails in URLs or logs. Use separate staging and production environments where feasible. Use CSRF-safe form handling, secure action tokens and suppression lists.

**Observability:** Audit issue generation, validation failures, source errors, approval events and sends; report failures to the operator. Capture minimal privacy-respecting engagement indicators (for example, signed clicks to issue links); do not use email open rate as a perfect measure of readership.

**Cost discipline:** Bound model calls, retries, ingestion volume and rendering costs. Provide documented monthly cost assumptions, with unknown vendor-dependent amounts identified rather than fabricated. Keep the system viable for the initial cohort of ≤500 readers.

---

## 13. Copy and content governance

Maintain exact approved headline, subline and publication names unless explicitly changed. Every public factual claim must have directly supporting evidence. Every recommendation must distinguish observation from judgment; source excerpts are bounded and attributed. Research citations in the Method page are not claimed as endorsements. No fabricated subscriber testimonials, partners, revenue claims or awards.

Issue metadata must show local date and relevant article/event dates. The primary editorial voice is serious, restrained, independent and analytically precise, with no hype, breathless “game-changing” headlines, stock AI phrases or pseudo-academic jargon.

Each position must indicate the strongest supporting evidence and the strongest blocking risk. If an idea is not actionable, say so. If sources conflict, communicate that disagreement rather than silently picking one.

**Brand integrity:** No new tagline, logo concept, palette, route, publication subject, pricing tier or public feature without explicit product-owner approval.

---

## 14. Testing and acceptance criteria

| Domain | Definition of done |
|---|---|
| **Responsive fidelity** | Screens tested at 320, 375, 390, 430, 768, 1024 and 1440 px. No horizontal scroll, clipping or inaccessible controls. Mobile screenshot approved against reference. |
| **Email CTA** | One integrated email input + white button (no arrow/no gap). Submit opens working modal; keyboard and touch work. |
| **Application** | Required server validation, clear consent, verified email, dedupe, secure storage, ability to review/approve/decline; no accidental mailing of applicants. |
| **Founding cohort** | Exactly max 500 approved core-Brief free-for-life entitlements, enforced transactionally. No misleading live scarcity figure. |
| **Website content** | Exact names and hierarchy, no false claims, functioning Brief/Method/About/privacy links, no fake coming-soon subscriptions. |
| **Evidence quality** | 100% of material published factual claims link to accessible, directly supporting sources; missing support blocks release. Check source/event date differentiation. |
| **Intelligence** | 00/01/02 separation visible; at least one publication-ready example issue independently source-checked; meaningful counterargument in position. |
| **Continuity** | Publish initial position, then a later revision linked to original stable ID, evidence and dated change; prior assessment remains available. |
| **Editorial control** | Draft → QA → preview → explicit approve → scheduled send. Unapproved/failing issue never sends. |
| **Daily schedule** | 9 AM Toronto weekdays through EST/EDT transitions; exactly-once delivery verified by tests and replay simulation. |
| **Delivery quality** | HTML, text, PDF links, unsubscribe, bounced-address suppression, sending authentication and retry safety tested via sandbox. |
| **PDF** | Readable on phone and desktop, selectable text, working article citations, good page breaks, clean professional layout. |
| **Accessibility** | Semantic headings, keyboard focus, modal close/focus trap/return, field labels, contrast, reduced-motion handling. Target WCAG 2.2 AA for public routes. |
| **Deployment** | Reproducible build, documented env vars and secret setup, migrations, preview/staging, deploy/rollback commands, tests green. |

### Essential negative tests

A fabricated article must not become a verified claim; a valid link that doesn't support a claim must fail; an announcement must not be described as completed; a low-quality news day must not force a fresh position; an unsubscribed user must never receive an edition; duplicate job runs must never duplicate delivery; an unapproved issue must never send; a position update must not overwrite the original; a failed PDF generation must block the issue; an expired/abusive application token must not expose or change subscriber state.

---

## 15. Metrics and commercial learning (not a public dashboard)

Measure qualified applications, approved activation, four-week return behavior (click/read proxies plus qualitative feedback), referrals, substantive reader replies, editorial factual correction rate, amount of human time per edition, failed sends and cost per delivered brief. **North-star:** demonstrable recurring decision usefulness to qualified readers. Do not optimize vanity subscriber growth at the expense of research quality.

Start with an intentionally limited cohort, then grow toward the founding ceiling based on repeat engagement and production reliability. Later test willingness to pay with real purchase intent. The 500-reader figure is a membership cap, **not** proof of value or an automatic paywall trigger.

---

## 16. Implementation sequence and required deliverables

| Order | Milestone | Tangible deliverable |
|---|---|---|
| **1** | Foundation | Repository, design tokens, responsive website routes, approved hero and publications section, tests/screenshots |
| **2** | Access | Email-first form, real modal, backend, verification, consent, secure manual review, welcome email |
| **3** | Editorial content model | Structured sources/claims/signals/consequences/positions/issues, migrations and initial source-verification routines |
| **4** | Living continuity | Stable positions, append-only revisions, evidence linkage and compact update component |
| **5** | Publishing | HTML/email and PDF from one edition schema, source links, editorial approval/hold, corrections |
| **6** | Scheduling and delivery | 9 AM Toronto weekday orchestration, Resend or equivalent, unsubscribe, delivery suppression, observability |
| **7** | Launch verification | Real fully checked specimen, QA on devices, staged end-to-end test, deployment checklist and final human acceptance |

**Required developer outputs:** Runnable source code; tests; database schema and migrations; environment-variable example; provider setup guide; internal editorial operating guide; screenshots at specified widths; an issue preview using real verified sources; a launch checklist distinguishing done from account-dependent actions; and a short known-limitations report. No claims that services are live without real deployment verification.

**Acceptance condition:** The founder can open the page on an iPhone, submit a real invitation request, review and approve it privately, receive a welcome email, approve a source-verified issue, and see exactly one correctly dated weekday email with an accessible PDF. A subsequent issue displays a correctly sourced continuity update to the earlier position.

---

## 17. Handoff instruction / no-drift contract for Claude Opus 5.5

**Build the actual 012 MEDIA MVP from this document.** Preserve all locked product decisions. Use the approved landing-page image from the prior conversation as the visual reference when supplied; do not treat an earlier unsuccessful HTML prototype as a quality benchmark. Implement the mobile-first working experience and the private publishing system in one repository. Do not propose Lovable, generate another static image as the deliverable, or broaden scope with dashboards, user accounts, paid subscriptions, community features, referral slots or unnecessary visual elements.

Start by examining the repository and assets (if supplied), establishing a small implementation plan and building the running product. Use sensible engineering defaults for unstated low-risk details. Clearly identify external account credentials, domain DNS updates, publisher identity/legal details, research-source subscriptions and final editorial release decisions that require human action; do not fake these connections. Demonstrate working features with tests and preview artifacts, and distinguish completed implementation from remaining deployment work.

**Product in one sentence:** 012 MEDIA is a beautifully restrained, invitation-only publisher of living intelligence: **00 Signal → 01 Consequence → 02 Position**, delivered as a trustworthy weekday AI Economy Brief that remembers and updates its earlier judgments.

---

## 18. Required companion implementation specification

**Implementation attachment:** `012_Intelligence_Engine_Architecture_v1.md`. This document is mandatory alongside the PRD when handing the project to Claude Opus 5.5. The engine is not merely a “report generator.” It comprises stage-specific 00/01/02 analytical processes, the continuity memory, and a separate publishing renderer. Production acceptance requires a real-source, provenance-linked, human-approved, reproducible end-to-end run, not just a well-formatted sample issue.
