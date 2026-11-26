# 012 MEDIA — Intelligence Engine Architecture
## Engineering contract for Claude Opus 5.5
**Version:** 1.0 — 23 November 2026  
**Status:** Design specification; not a statement that production algorithms have already been implemented or scientifically validated.  
**Related document:** `012_MEDIA_Product_Vision_and_PRD_v1.1.md` (authoritative product requirements).  
**Scope:** Internal research and editorial pipeline for **01 / AI ECONOMY**, reusable for future publications. No public dashboard, community or personalization.

---

## 1. Canonical terminology: use these names everywhere

| System | Canonical name | Responsibility |
|---|---|---|
| Public research framework | **012 Intelligence Method** | Explain the epistemic approach; `00 / SIGNAL → 01 / CONSEQUENCE → 02 / POSITION` |
| Technical system | **012 Intelligence Engine** | Orchestrate evidence collection, analysis, quality gates and position formation |
| Stage 00 | **012 Signal Engine** | Discover, isolate, verify, cluster and select consequential developments |
| Stage 01 | **012 Consequence Engine** | Establish causal mechanisms, second-order implications and uncertainties |
| Stage 02 | **012 Position Engine** | Form commercially useful judgments; evaluate competing explanations and next tests |
| Cross-edition record | **012 Continuity Ledger** | Preserve position identity, evidence linkage, dated revisions and review triggers |
| Editorial rendering / dispatch | **012 Publishing Engine** | Transform approved structured editions into HTML email, accessible PDF and scheduled delivery |

**Important:** The Publishing Engine is **not** the Intelligence Engine. Generating a PDF is a rendering task, not the intelligence process. Continuity is a **cross-cutting memory service**, not a fourth numbered method stage. These exact terms must be used in directory names, interfaces, logs, tests and technical documentation. The public site should describe the **012 Intelligence Method**, not expose internal orchestration jargon.

## 2. What is being productized

The ChatGPT prototype has demonstrated an editorial workflow: research recent consequential developments; distinguish evidence from conjecture; synthesize strategic implications; identify opportunities and competitors; assess commercial attractiveness, saturation and execution risks; recommend what to test; update the next issue. The prototype has **not** been a fixed, reproducible, fully audited algorithm. Some past editions contained claims or links that were insufficiently verified. The production system must **retain the useful editorial sequence and improve the evidentiary standard**. Never implement replay by copying historic reports as factual ground truth.

**Internal breadth vs. public selectivity:** Review a broad research pool across models, agents, enterprise, infrastructure, silicon, data centers, energy, research, regulation and economics. Initially target at least 8–12 *eligible candidate developments*, subject to actual news availability; do not fabricate candidates or force quotas. The public issue typically contains **3–5 verified signals**, **2–3 synthesized consequences**, **one position** (new or revised), and **a compact continuity update when material**. The internal Position Engine may evaluate many candidate opportunities, including the complete 14-dimension rubric; the reader receives the most defensible position, not one invented business idea per story.

## 3. Boundary conditions and engineering style

- Single code repository; separate domain modules with stable contracts. Do not build a microservice fleet or agent framework merely for architectural appearance. A deterministic orchestrator calls retrieval APIs and bounded LLM tasks.
- Live-source retrieval required: no self-generated URLs, citations, quotes, dates, competitor capabilities or market statistics. Source content is untrusted input. Source links must be opened and matched to actual claim support.
- Working timezone: **America/Toronto**. Run preparatory jobs before the weekday 9:00 AM ET mailing. Never assume a fixed UTC offset. The scheduler fails closed without release authorization.
- All stages store both immutable observations and revisions, including timestamps, model/prompt versions, structured inputs/outputs and editor decisions. Protect copyrighted source content; only retain permissible excerpts and locators.
- Prefer schema-validated outputs, retries with limits, idempotent tasks, and human review. Avoid stochastic reasoning presented as deterministic proof.
- A quiet day is valid. `NO_MATERIAL_POSITION` is a valid output. Do not manufacture insights to satisfy layout.

## 4. Shared record model and contracts

The following are **logical contracts**; implement as TypeScript/Zod schemas and relational persistence. Use typed IDs, UTC creation times plus source-local event dates, and clear distinctions among `observed`, `reported_claim`, `inference`, `hypothesis` and `forecast`.

```ts
type Provenance = {
  sourceId: string;
  canonicalUrl: string;              // opened and validated
  publisher: string;
  publishedAt?: string;             // ISO datetime, optional if unknown
  eventAt?: string;                 // event date may differ from publication
  retrievedAt: string;
  locator: string;                  // section, paragraph or document reference
  excerpt?: string;                 // brief and rights-compliant
};

type Claim = {
  id: string;
  text: string;                     // atomic, falsifiable where practical
  type: 'observed'|'reported_claim'|'inference'|'hypothesis'|'forecast';
  provenance: Provenance[];
  support: 'supported'|'qualified'|'contradicted'|'unverified';
  caveat?: string;
};

type Signal = {
  id: string;
  eventClusterId: string;
  headline: string;
  eventAt?: string;
  topicTags: string[];
  claimIds: string[];
  sources: string[];
  weakSignal: boolean;
  selectionRationale: string;
  editorialStatus: 'candidate'|'review'|'accepted'|'rejected';
};

type Consequence = {
  id: string;
  linkedSignalIds: string[];
  statement: string;
  mechanism: string;                // explicit because-chain
  affectedActors: string[];
  assumptions: string[];
  alternatives: string[];
  disconfirmingIndicators: string[];
  horizon: 'near'|'medium'|'long'|'unknown';
  evidenceConfidence: 'low'|'medium'|'high';
};

type Position = {
  id: string;                       // permanent e.g. POS-000042
  publicationId: string;
  originalThesis: string;           // immutable after first publication
  linkedConsequenceIds: string[];
  decision: 'PURSUE'|'MONITOR'|'DISMISS'|'NO_MATERIAL_POSITION';
  rationale: string;
  alternatives: string[];
  blocker: string;
  falsificationTest?: string;
  reviewDate?: string;
  scorecardId?: string;
};

type Revision = {
  id: string;
  positionId: string;
  previousStatus: string;
  newStatus: string;
  triggerClaimIds: string[];
  recordedAt: string;
  issueId?: string;
  rationale: string;
  editorApprovalId: string;
};
```

**Validation contracts:** An unverified claim cannot appear as an unqualified fact. A consequence references accepted signals. A position references supported consequences or explicitly identified additional facts. A revision cannot modify the original position text or remove prior versions. A published issue may not refer to an unapproved position/revision. Every public source link must resolve to the intended item, not to a generic publisher topic index.

## 5. Engine 00 — 012 Signal Engine

### Purpose
Transform heterogeneous information streams into a deduplicated, independently inspectable set of relevant, source-supported developments.

### Modules
`discoverSources → retrieveDocuments → normalizeDatesAndURLs → clusterEvents → extractAtomicClaims → verifyClaims → detectContradictions → classifyWeakSignals → prioritizeCandidates → selectSignals`

**Discovery.** Search and ingest across the published editorial domains. Prefer original lab/company notices, technical papers, regulations and filings, supported by trusted independent reporting. Capture publication timestamp, actual event date, article type, and retrieval timestamp separately. Avoid counting multiple rewrites of the same wire report as independent corroboration.

**Isolation.** Normalize canonical URL, source fingerprint and entities; cluster articles about one underlying event. Split material sentences into atomic claims. Preserve quantities and units, and distinguish **announced / approved / purchased / shipped / installed / operational**. Mark reporting of an allegation as `reported_claim`, not as an established outcome.

**Verification.** For each consequential claim, find direct source support. Primary source preferred for what a company announced; independent reporting preferred for contested characterization. If no support exists, reject or explicitly qualify; don't fill the gap with model knowledge. A secondary source is not automatically disallowed, but publisher index pages and unrelated links are invalid substitutes for article-level evidence.

**Weak-signal mapping.** Add `weakSignal = true` only when a real, low-visibility observation plausibly precedes meaningful change and the causal rationale is documented. Do not equate low coverage with truth, and do not award novelty because the model has not heard of an event.

### Prioritization algorithm (proposed heuristic, not an empirically validated model)
For each **eligible event cluster**, score 0–5 with documented evidence for: `materiality`, `decision relevance`, `novelty versus prior records`, `causal reach`, and `source reliability`. A suggested initial selector is:

`candidatePriority = .30*materiality + .25*decisionRelevance + .20*causalReach + .15*novelty + .10*sourceReliability`

A hard verification gate is more important than the weighted ranking: candidates with critical unsupported claims are excluded or held even when their priority is high. The weights are **product-design defaults**, not scientific findings. Record factor explanations; use editorial overrides with a written rationale. Reserve room for credible weak signals; avoid choosing only high-volume headline news. Add diversity constraints to avoid an entire issue covering only one company or theme; do not impose fake category quotas.

### Output and failure behavior
Output accepted `Signal[]` with claim provenance, ranked reasons and rejected candidates with reasons. Retrieval failure cannot be bypassed through guessed facts. An insufficiently verified day may produce fewer signals or no publication.

## 6. Engine 01 — 012 Consequence Engine

### Purpose
Convert verified signals into coherent, bounded interpretations of **how change propagates**, not summaries with speculative conclusions.

### Modules
`mapAffectedActors → deriveCausalMechanisms → mapDependenciesAndConstraints → assessFirstOrderEffects → assessSecondOrderEffects → testCounterfactuals → generateCompetingExplanations → identifyDisconfirmingEvidence → synthesizeConsequences`

### Analysis procedure
1. For each material signal, specify the directly observed change and who is affected.
2. Write a causal chain with explicit intermediate mechanisms: `event → capability/constraint → stakeholder response → commercial/economic consequence`.
3. Identify at least one assumption required for the chain and a realistic competing interpretation; avoid unsupported causal leaps.
4. Compare with the baseline: what would likely continue if the development had not occurred? Distinguish incremental news from a structural shift.
5. Consider timing and constraints: technology readiness, regulatory requirements, distribution, power/compute, incentives, customer adoption.
6. Identify one or more observable disconfirming indicators. Check whether new signals support, weaken or do not affect existing positions in the Continuity Ledger.
7. Select approximately 2–3 high-value cross-signal consequences, or fewer if evidence warrants.

**Evidence discipline.** Every implication must clearly separate supported observation from analytical inference. Evidence confidence is an explicit expert judgment, explained in prose; it is not a scientific probability. Editorial check: *Would the implication still make sense if the headline were replaced by a neutral factual description?* If not, return for revision.

### Output and failure behavior
Return `Consequence[]`, linked to accepted signals, counterarguments and conditional indicators. If competing explanations cannot be separated, communicate uncertainty; do not turn ambiguity into certainty.

## 7. Engine 02 — 012 Position Engine

### Purpose
Translate consequential change into a disciplined recommendation or watch condition. **A position is not always a startup idea.** It can be a market opportunity, risk, operational implication or explicit no-action judgment.

### Modules
`generateCandidatePositions → mapActorAndDecision → assessDemandOrImpact → mapCompetitorsAndAlternatives → evaluateFeasibilityAndRisk → applyCommercialRubricWhereApplicable → runAdversarialReview → defineFalsificationTest → rankForEditorialSelection → finalizePosition`

### Strategic position record
Specify `target actor → decision to consider → why now → supporting observations → economic mechanism → strongest alternative/counterargument → biggest blocker → disconfirming test → review date`. Maintain an explicit `PURSUE`, `MONITOR`, `DISMISS` or `NO_MATERIAL_POSITION` verdict. Editorial decision need not be a paid business proposal.

### Commercial opportunity assessment (internal only by default)
For commercially actionable hypotheses, record all **14** dimensions on a 0–10 scale, with each score supported by a short written rationale and unknowns visibly marked:

1. Execution/founder archetype fit; 2. market attractiveness; 3. market saturation (0 underserved, 10 crowded); 4. customer urgency; 5. monetization/willingness to pay; 6. reachable market/growth; 7. differentiation; 8. distribution feasibility; 9. MVP speed/feasibility; 10. capital efficiency; 11. scalability; 12. timing; 13. execution/regulatory risk (10 high risk); 14. evidence confidence.

**Priority formula** (where all weighted inputs are actually assessable):

`0.20*fit + 0.20*market + 0.10*urgency + 0.10*monetization + 0.10*differentiation + 0.10*distribution + 0.10*MVP + 0.05*capitalEfficiency + 0.05*scalability`

`market saturation`, `execution/regulatory risk` and `evidence confidence` are **caution/override** dimensions, not added or subtracted again; `reachable market/growth` and `timing` are independently assessed but not weighted in this fixed formula. A critical unknown or material employer conflict can prohibit `PURSUE` regardless of arithmetic ranking. Score values are judgmental hypotheses, not measured market facts. Do not coerce missing evidence into arbitrary numeric certainty. Explicitly flag if critical factors remain unscored. A competitive market is not intrinsically unattractive; evaluate actual product differentiation, buyer willingness to pay and accessible distribution. Use named competitors only after verifying that those competitors exist and are relevant; avoid claiming an unoccupied niche without evidence.

**Editor relevance vs personalized analysis:** The original prototype's founder fit was tailored to one Toronto-based Autodesk AI design leader. For public 012 issues, either define the operator archetype for the evaluation or omit fit; never use a personal profile invisibly as a universal score.

### Adversarial gate and final selection
Run a distinct critique pass to identify overstated novelty, weak demand evidence, absent competitor knowledge, implausible differentiation, high-risk compliance/employer overlap and unfalsifiable next tests. The position must clearly identify one decisive obstacle and a small next validation step. Select the most decision-useful position, **not necessarily the highest arithmetic score**. If no position clears the bar, publish an explicit monitor/no-action conclusion or hold the issue.

## 8. 012 Continuity Ledger — cross-issue memory and ratification

### Role
The Ledger provides *living intelligence*: new evidence changes prior judgments only when it **materially** changes the original thesis, action, key conditions, confidence or review timing. It is not a separate public product or fee tier.

### Workflow
`entity/event matching → retrieve prior positions → evaluate genuinely new evidence → compare old and new thesis → propose status transition → evidence-supported human ratification → append revision → publish compact continuity line`

Status options: `EMERGING`, `STRENGTHENING`, `STABLE`, `WEAKENING`, `VALIDATED`, `INVALIDATED`, `UNRESOLVED`, `RETIRED`. `VALIDATED` requires fulfillment of prespecified conditions, not merely positive news. `INVALIDATED` requires evidence contradicting prespecified conditions. `RETIRED` means tracking has ended, not that the thesis was false. No opaque composite continuity metric. Store unchanged reviews privately without filling every public issue with stale updates.

### Matching and update logic
Use exact known entity IDs and topical relationships first; semantic similarity can suggest related candidates but cannot establish that one position has changed. Compare the new source facts to the immutable original thesis and latest approved revision. Require explicit **why this alters the judgment**. If merely adjacent, link the evidence without altering status. Maintain historical versions, original publication identifiers and next review triggers. Every material update is append-only and includes editor identity and cited new claims.

## 9. Editorial ratification and publication state machine

**No autonomous dispatch of unapproved AI research.** Use an explicit state sequence:

`COLLECTED → VERIFIED → SYNTHESIZED → CHALLENGED → DRAFTED → EDITOR_APPROVED → RENDERED → SEND_READY → SENT`

Failure / nonpublication states: `HELD_FOR_EVIDENCE`, `HELD_FOR_APPROVAL`, `FAILED_RENDER`, `FAILED_DELIVERY`, `CORRECTED`, `WITHDRAWN`. Transitions must enforce invariants; never skip from collected to sent. Store a cryptographic hash/version of the editor-approved issue and render from that immutable record. If an issue changes after approval, it requires reapproval. Hold rather than improvise content when a dependency fails.

**Automated preflight:** Claim-to-source support complete; broken link checks; dates and timezone verified; numerical claim units consistent; 00/01/02 records connected; continuity revisions attributable; citations appear in the PDF; word-count/readability and layout bounds; copyright excerpt bounds; no unapproved subscriber recipients; unsubscribe functional; scheduled local date not already sent.

**Human decision:** Approve, request revision or hold. Human approval validates *editorial release*, not a scientific guarantee of truth. The person approving has access to the evidence and a source-review manifest.

## 10. 012 Publishing Engine — output only

One finalized, approved `Issue` record is the **single source of content truth**. Render all channels from it:

- **Email:** A short, accessible HTML summary with central thesis, 00/01/02 snapshots, one appropriate continuity line and a link to the complete issue. Include text-only alternative, publisher identification and unsubscribe.
- **PDF:** Typographically polished, selectable text, active citation links, correct reading order, local date, issue ID, edition version, method/continuity metadata, coherent page breaks. Hosted with unlisted public URLs if no login is offered.
- **Specimen:** An explicitly authorized public example rendered from an actual verified issue, not illustrative news pretending to be real.

Dispatch at 9 AM **America/Toronto**, Monday–Friday, **exactly once per local issue date** after editorial approval, using unique issue/broadcast keys. Delivery retries may resume incomplete batches without resending successful recipients. Never treat a draft email or a file existing locally as proof of delivery.

## 11. Schedule, orchestration and module scaffolding

Suggested source structure (illustrative; a developer may choose an equivalent clean design):

```text
apps/web/                    # landing, Method page, application form
packages/contracts/         # Zod schemas, IDs, state machines
packages/intelligence/
  signal/                   # sources, events, claims, verification, ranking
  consequence/              # causal mapping, alternative hypotheses
  position/                 # assessment, critique, verdicts
  continuity/               # position matching, reviews, append-only revisions
packages/publishing/        # editorial HTML, email, PDF templates
packages/connectors/        # search/source, LLM, mail, object storage adapters
packages/review/            # private/editorial approval mechanisms
jobs/                       # ingest, draft, preflight, approve, send, monitor
migrations/                 # persistence and uniqueness constraints
tests/                      # unit, integration, end-to-end, fixtures
```

**Dependency rule:** `signal` must not import `position` or publication formatting. `consequence` may reference verified signal contracts, not live HTML. `position` may consume consequences and verified market evidence. `continuity` consumes new evidence and existing position records, never overwrites history. `publishing` consumes approved issue snapshots only. Each module is testable independently using fixtures and mocked provider responses.

### High-level daily pseudocode

```ts
async function prepareEdition(localDate: string): Promise<EditorialDraft> {
  const researchPool = await signalEngine.collectAndVerify({
    publicationId: '01-ai-economy', localDate, lookbackHours: 72,
    preferLastHours: 24
  });
  const selected = await signalEngine.prioritize(researchPool);
  const consequences = await consequenceEngine.synthesize(selected);
  const candidatePositions = await positionEngine.evaluate(consequences);
  const continuityCandidates = await continuityLedger.reviewNewEvidence({
    signals: selected, consequences, positions: candidatePositions
  });
  const draft = await editorialAssembler.compose({
    signals: selected, consequences, candidatePositions,
    continuityCandidates, publicationId: '01-ai-economy', localDate
  });
  const critique = await editorialReview.adversarialCheck(draft);
  return editorialReview.preflight(draft, critique); // may HOLD
}

async function publishApprovedEdition(localDate: string): Promise<void> {
  const approved = await repository.getApprovedImmutableIssue(localDate);
  if (!approved) return;                       // no auto-publish on missing approval
  await publishingEngine.renderAndDispatchOnce(approved);
}
```

**Important:** This pseudocode is an architectural contract, not working code. The implementation must include idempotency, rate limits, retries, cost caps, source rights, privacy safeguards and exception handling detailed in the PRD.

## 12. Test matrix and scientific humility

| Test | Expected behavior |
|---|---|
| False or dead article URL | Reject/hold claim; no invented substitute |
| Correct URL, wrong article | Claim fails provenance check |
| Reuters rewrite across several publishers | One event cluster; not multiple independent confirmations |
| Proposal reported as enacted law | Fails event-state qualification |
| Announced GPU shipment treated as operational capacity | Fails unit/state check |
| Weak signal with strong causal potential | Candidate may advance with explicit limited evidence |
| Impressive but speculative consequence | Requires causal chain and competing hypothesis, or is held |
| Commercial idea with unverified buyer demand | Mark assumption; do not call validated GO |
| Existing opportunity mentioned in new signal | Review continuity rather than duplicate as new position |
| Position status changes without new supporting evidence | Reject revision |
| Model produces citations that were not retrieved | Reject/hold draft |
| Missing editor approval | No send |
| Two cron triggers across Toronto DST boundary | One send per local date |
| Partial provider batch failure | Resume safely without duplicate messages |
| LLM/source API unavailable | Retry within cap; otherwise hold and alert |
| Quiet news day | Shorter edition or hold; never fabricate volume |

### Evaluation research program (not required as public feature)

Maintain a small manually labeled validation set spanning true/false claims, duplicate clusters, temporal ambiguities, causal overreach, competitor misidentification and position revisions. Compare extraction/verification precision, citation-support accuracy, editorial acceptance rate, error severity, revision correctness and time per issue. Review systematically after publication; do not represent the 012 Engine as peer-reviewed or statistically validated until appropriate independent evaluation exists.

## 13. Implementation acceptance and definition of done

An engineer must demonstrate **one complete grounded dry run** with real retrieved sources and provenance records, a verified claim manifest, selected signals, consequence reasoning, a position with credible counterargument, a continuity proposal against a seeded older position, human-approved publication record, accessible HTML/PDF outputs and idempotent test email delivery. Tests must show blocking behavior for fake links, unsupported claims, unapproved issues and duplicate sends.

The engine is **not done** merely because an LLM can return JSON, produce a newsletter-like passage or generate a visually attractive PDF. Completion means the above pipeline runs with real-source evidence, inspectable decisions, enforced quality gates and reliable, observable publication behavior.
