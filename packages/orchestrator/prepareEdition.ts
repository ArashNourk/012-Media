import { PUBLICATION_01, hashJson, type Claim, type IssueState, type Position, type Signal } from '../contracts';
import { StagePendingError } from '../connectors/llm/runner';
import { ConsequenceEngine } from '../intelligence/consequence/engine';
import { ContinuityLedger } from '../intelligence/continuity/ledger';
import type { EngineContext } from '../intelligence/context';
import { PositionEngine } from '../intelligence/position/engine';
import { RetrievalFailure, SignalEngine } from '../intelligence/signal/engine';
import type { IssueRecord, RunRecord } from '../persistence/repository';
import type { PublishingEngine } from '../publishing/engine';
import { isPublicationDay } from '../publishing/schedule';
import { assembleIssue } from '../review/assemble';
import { manifestKey, preflightKey } from '../review/approval';
import { buildManifest } from '../review/manifest';
import { runEditorialPreflight, type PreflightReport } from '../review/preflight';
import { COMPOSE, DRAFT_ADVERSARIAL_CHECK } from '../review/tasks';

export interface PrepareOptions {
  localIssueDate: string;
  asOf: string; // ISO instant ending the research window
  lookbackHours?: number;
  preferLastHours?: number;
  editorialNotes?: string[];
  liveLinkCheck?: boolean;
  fresh?: boolean; // start a new run instead of resuming
}

export type PrepareResult =
  | { status: 'drafted'; run: RunRecord; issue: IssueRecord; preflight: PreflightReport; manifestKey: string; previewPdfKey?: string }
  | { status: 'awaiting_analysis'; run: RunRecord; pending: string[] }
  | { status: 'held'; run: RunRecord; issue?: IssueRecord; reason: string }
  | { status: 'quiet'; run: RunRecord; issue: IssueRecord; reason: string };

const ORDER: IssueState[] = ['COLLECTED', 'VERIFIED', 'SYNTHESIZED', 'CHALLENGED', 'DRAFTED'];

/**
 * The deterministic daily sequence of the 012 Intelligence Engine:
 *   00 Signal  — Discover → Extract → Verify → Prioritize
 *   01 Consequence — Map → Infer → Challenge → Synthesize
 *   02 Position — Evaluate → Compare → Decide → Test
 *   Continuity Ledger — Match → Review → (Revise at approval)
 *   Editorial review — Compose → Adversarial check → Preflight → Preview → DRAFTED
 * Every stage persists its records; reruns resume (analysis outputs are reused
 * by input hash). Any missing dependency holds the edition — nothing is improvised.
 */
export async function prepareEdition(ctx: EngineContext, publishing: PublishingEngine, o: PrepareOptions): Promise<PrepareResult> {
  const { repo } = ctx;
  const pub = PUBLICATION_01.id;
  if (!isPublicationDay(o.localIssueDate)) throw new Error(`${o.localIssueDate} is not a Monday–Friday publication date (America/Toronto)`);
  const lookbackHours = o.lookbackHours ?? 72;
  const prior = repo.latestRun(pub, o.localIssueDate);
  const resume = !o.fresh && prior && prior.status === 'running' && prior.asOf === o.asOf && prior.lookbackHours === lookbackHours;
  const run = resume
    ? prior!
    : repo.createRun({ publicationId: pub, localIssueDate: o.localIssueDate, asOf: o.asOf, lookbackHours, preferLastHours: o.preferLastHours ?? 24, provider: ctx.runner.providerId });
  let issue = resume ? repo.getIssueByDate(pub, o.localIssueDate) ?? repo.createIssue(pub, o.localIssueDate, run.id) : repo.createIssue(pub, o.localIssueDate, run.id);
  repo.updateRun(run.id, 'started', 'running');

  const advance = (to: IssueState, note: string) => {
    const cur = repo.getIssue(issue.id);
    const ci = ORDER.indexOf(cur.state);
    const ti = ORDER.indexOf(to);
    if (ci >= 0 && ti >= 0 && ci >= ti) return;
    issue = repo.transitionIssue(issue.id, to, 'engine', note);
  };
  const hold = (reason: string): PrepareResult => {
    const cur = repo.getIssue(issue.id);
    if (cur.state !== 'HELD_FOR_EVIDENCE') issue = repo.transitionIssue(issue.id, 'HELD_FOR_EVIDENCE', 'engine', reason);
    repo.updateRun(run.id, 'held', 'held', reason);
    return { status: 'held', run: repo.getRun(run.id), issue, reason };
  };

  const signalEngine = new SignalEngine(ctx);
  try {
    // ---------------------------------------------------------------- 00 / SIGNAL
    let collected;
    try {
      collected = await signalEngine.collect(run);
    } catch (e) {
      if (e instanceof RetrievalFailure) return hold(`retrieval failed: ${e.message}`);
      throw e;
    }
    repo.updateRun(run.id, 'collected', 'running', `${collected.sources.length} in-window sources`);
    if (!collected.sources.length) {
      const reason = `quiet window: no eligible source documents published in the ${lookbackHours} h ending ${o.asOf} (${collected.outOfWindow} discovered items outside the window, ${collected.failed.length} retrieval failures)`;
      hold(reason);
      repo.updateRun(run.id, 'quiet', 'quiet', reason);
      return { status: 'quiet', run: repo.getRun(run.id), issue: repo.getIssue(issue.id), reason };
    }
    const { clusters, claims } = await signalEngine.isolateAndVerify(run, collected.sources);
    const allSignals = await signalEngine.prioritize(run, clusters, claims);
    const accepted = allSignals.filter((s) => s.editorialStatus === 'accepted');
    if (!accepted.length) {
      const reason = `insufficiently verified day: ${clusters.length} event cluster(s), no signal passed the verification gate and priority threshold`;
      hold(reason);
      repo.updateRun(run.id, 'quiet', 'quiet', reason);
      return { status: 'quiet', run: repo.getRun(run.id), issue: repo.getIssue(issue.id), reason };
    }
    advance('VERIFIED', `${accepted.length} accepted signal(s), ${claims.filter((c) => c.support === 'supported' || c.support === 'qualified').length} verified claims`);

    // ---------------------------------------------------------------- 01 / CONSEQUENCE
    const tracked = repo.listLedgerPositions(pub).map((p) => ({
      positionId: p.id,
      thesis: p.originalThesis,
      status: p.currentStatus,
      validationConditions: p.validationConditions,
      invalidationConditions: p.invalidationConditions,
    }));
    const consequences = await new ConsequenceEngine(ctx).synthesize(run, accepted, claims, tracked);
    const acceptedCons = consequences.filter((c) => c.status === 'accepted');
    advance('SYNTHESIZED', `${acceptedCons.length} accepted consequence(s), ${consequences.length - acceptedCons.length} held`);

    // ---------------------------------------------------------------- 02 / POSITION + Continuity Ledger
    const signalClaimIds = accepted.flatMap((s) => s.claimIds);
    const positionResult = await new PositionEngine(ctx).evaluate(run, consequences, claims, signalClaimIds);
    const proposals = await new ContinuityLedger(ctx).reviewNewEvidence(run, accepted, consequences, claims);
    advance('CHALLENGED', `${positionResult.candidates.length} position candidate(s); ${proposals.length} continuity proposal(s)`);

    // Reserve a permanent position ID for a newly selected position (draft until approval).
    let positionEntry: Parameters<typeof assembleIssue>[0]['position'] = null;
    if (positionResult.selected) {
      const cand = positionResult.selected;
      let rec = repo.findPositionByCandidate(cand.id);
      if (!rec) {
        const entities = [...new Set(accepted.filter((s) => cand.supportingClaimIds.some((id) => s.claimIds.includes(id))).flatMap((s) => s.entities))];
        const topicTags = [...new Set(accepted.filter((s) => cand.supportingClaimIds.some((id) => s.claimIds.includes(id))).flatMap((s) => s.topicTags))];
        const pos: Position = {
          id: repo.reservePositionId(),
          publicationId: pub,
          originalThesis: cand.thesis,
          linkedConsequenceIds: cand.linkedConsequenceIds,
          decision: cand.decision,
          rationale: positionResult.selectionRationale,
          alternatives: cand.alternatives,
          blocker: cand.blocker,
          falsificationTest: cand.falsificationTest,
          reviewDate: cand.reviewDate,
          scorecardId: cand.scorecard?.id,
          targetActor: cand.targetActor,
          decisionToConsider: cand.decisionToConsider,
          entities,
          topicTags,
          supportingClaimIds: cand.supportingClaimIds,
          validationConditions: cand.validationConditions,
          invalidationConditions: cand.invalidationConditions,
          initialStatus: 'EMERGING',
          currentStatus: 'EMERGING',
          firstIdentifiedOn: o.localIssueDate,
          candidateId: cand.id,
          seeded: false,
          createdAt: repo.now(),
        };
        repo.insertPosition(pos, false);
        rec = { ...pos, published: false };
      }
      positionEntry = { record: rec, candidate: cand, isNew: !rec.published };
    }

    const continuity = proposals
      .filter((p) => p.status === 'proposed')
      .slice(0, 2)
      .map((p) => ({ proposal: p, position: repo.getPosition(p.positionId)! }));

    // ---------------------------------------------------------------- editorial assembly
    const sources = new Map(repo.listRunSources(run.id).map((s) => [s.id, s]));
    for (const { proposal } of continuity) for (const id of proposal.newClaimIds) {
      const c = repo.getClaim(id);
      if (c && !sources.has(c.provenance[0].sourceId)) {
        const s = repo.getSource(c.provenance[0].sourceId);
        if (s) sources.set(s.id, s);
      }
    }
    const claimMap = new Map<string, Claim>(claims.map((c) => [c.id, c]));
    const notes = [...(o.editorialNotes ?? [])];
    const pubs = new Set(accepted.flatMap((s) => s.sources.map((id) => sources.get(id)?.publisher)).filter(Boolean));
    if (pubs.size === 1)
      notes.push(`Source base: every signal in this edition comes from a single publisher (${[...pubs][0]}), reporting on its own activities. Figures are self-reported and were not independently corroborated.`);
    if (lookbackHours > 72) notes.push(`Research window: ${Math.round(lookbackHours / 24)} days ending ${o.asOf.slice(0, 10)}, wider than the standard 72 hours.`);

    const compose = await ctx.runner.runAll(
      COMPOSE,
      [
        {
          localIssueDate: o.localIssueDate,
          signals: accepted.map((s) => ({ signalId: s.id, headline: s.headline, summary: s.summary, relevance: s.relevance, qualifications: s.evidenceQualifications })),
          consequences: acceptedCons.map((c) => ({ consequenceId: c.id, statement: c.statement })),
          position: positionEntry ? { decision: positionEntry.candidate.decision, thesis: positionEntry.record.originalThesis } : null,
          noPositionStatement: positionResult.noPositionStatement,
          continuity: continuity.map(({ proposal }) => ({ positionId: proposal.positionId, line: proposal.publicLine })),
        },
      ],
      run.id,
    );
    const content = assembleIssue({
      issueId: issue.id,
      localIssueDate: o.localIssueDate,
      editionNumber: issue.editionNumber,
      runId: run.id,
      headline: compose[0].output.headline,
      lead: compose[0].output.lead,
      signals: accepted as Signal[],
      consequences: acceptedCons,
      position: positionEntry,
      noPositionStatement: positionResult.noPositionStatement ?? (positionResult.selected ? undefined : 'No position cleared the evidence bar today. Monitor; no action.'),
      continuity,
      claims: claimMap,
      sources,
      editorialNotes: notes,
    });
    // Only store new content when it differs (a resumed run must not void a review needlessly).
    const cur = repo.getIssue(issue.id);
    const same = cur.content && hashJson({ ...cur.content, version: 0 }) === hashJson({ ...content, version: 0, issueId: cur.content.issueId });
    if (!same) issue = repo.setIssueContent(issue.id, content, 'engine');
    issue = repo.getIssue(issue.id);
    const stored = issue.content!;

    const usedClaims = [...new Set([...accepted.flatMap((s) => s.claimIds), ...acceptedCons.flatMap((c) => c.observedClaimIds), ...(positionEntry?.candidate.supportingClaimIds ?? []), ...continuity.flatMap((c) => c.proposal.newClaimIds)])]
      .map((id) => repo.getClaim(id))
      .filter((c): c is Claim => !!c);
    const adversarial = (
      await ctx.runner.runAll(
        DRAFT_ADVERSARIAL_CHECK,
        [{ draft: { ...stored, sources: stored.sources.map((s) => ({ url: s.url, publisher: s.publisher, title: s.title })) }, claims: usedClaims.map((c) => ({ claimId: c.id, text: c.text, support: c.support, caveat: c.caveat })) }],
        run.id,
      )
    )[0].output;

    const preflight = await runEditorialPreflight(repo, stored, { fetcher: ctx.fetcher, liveLinkCheck: o.liveLinkCheck ?? false, adversarialVerdict: adversarial });
    let previewPdfKey: string | undefined;
    try {
      const prev = await publishing.renderPreview(issue.id);
      previewPdfKey = prev.pdfKey;
      const missing = stored.sources.map((s) => s.url).filter((u) => !prev.pdfInfo.linkUris.includes(u));
      preflight.checks.push({
        id: 'pdf_preview_render',
        passed: prev.pdfInfo.hasFonts && prev.pdfInfo.pages > 0 && !missing.length,
        severity: 'block',
        detail: `${prev.pdfInfo.pages} page(s), text fonts ${prev.pdfInfo.hasFonts ? 'present' : 'MISSING'}, ${prev.pdfInfo.linkUris.length} active links${missing.length ? `; citations missing from PDF: ${missing.join(', ')}` : '; every source cited in the PDF'}${prev.pdfInfo.isTagged ? ', tagged' : ''}`,
      });
    } catch (e) {
      preflight.checks.push({ id: 'pdf_preview_render', passed: false, severity: 'block', detail: `PDF generation failed: ${e instanceof Error ? e.message : String(e)}` });
    }
    preflight.blocking = preflight.checks.some((c) => !c.passed && c.severity === 'block');
    await ctx.store.put(preflightKey(issue.id, stored.version), JSON.stringify(preflight, null, 2), 'application/json');
    const manifest = buildManifest(repo, stored, preflight);
    await ctx.store.put(manifestKey(issue.id, stored.version), manifest, 'text/markdown');
    advance('DRAFTED', preflight.blocking ? 'draft has blocking preflight failures' : 'draft ready for editor review');
    repo.updateRun(run.id, 'drafted', 'drafted', preflight.blocking ? 'blocking preflight failures' : 'awaiting editor approval');
    return { status: 'drafted', run: repo.getRun(run.id), issue: repo.getIssue(issue.id), preflight, manifestKey: manifestKey(issue.id, stored.version), previewPdfKey };
  } catch (e) {
    if (e instanceof StagePendingError) {
      repo.updateRun(run.id, 'awaiting_analysis', 'running', `${e.pending.length} analysis task(s) pending`);
      return { status: 'awaiting_analysis', run: repo.getRun(run.id), pending: e.pending.map((p) => p.responsePath) };
    }
    repo.updateRun(run.id, 'failed', 'failed', e instanceof Error ? e.message : String(e));
    const cur = repo.getIssue(issue.id);
    if (['COLLECTED', 'VERIFIED', 'SYNTHESIZED', 'CHALLENGED', 'DRAFTED'].includes(cur.state))
      repo.transitionIssue(issue.id, 'HELD_FOR_EVIDENCE', 'engine', `dependency failure: ${e instanceof Error ? e.message : String(e)}`);
    repo.audit('engine', 'alert', run.id, { message: 'edition preparation failed; issue held', error: String(e) });
    console.error(`[012 ALERT] ${o.localIssueDate}: edition preparation failed and is held — ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
}
