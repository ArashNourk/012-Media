import {
  Claim,
  Consequence,
  ContinuityProposal,
  EventCluster,
  IssueContent,
  Position,
  PositionCandidate,
  Revision,
  Signal,
  SourceDocument,
  assertTransition,
  canonicalJson,
  formatPositionId,
  hashJson,
  newId,
  type IssueState,
  type LedgerStatus,
} from '../contracts';
import { tx, type Db } from './db';

type Row = Record<string, unknown>;
const j = (v: unknown) => canonicalJson(v);
const p = <T>(s: unknown): T => JSON.parse(String(s)) as T;

export interface RunRecord {
  id: string;
  publicationId: string;
  localIssueDate: string;
  asOf: string;
  lookbackHours: number;
  preferLastHours: number;
  provider: string;
  stage: string;
  status: 'running' | 'held' | 'drafted' | 'failed' | 'quiet';
  statusDetail?: string;
  llmCalls: number;
  createdAt: string;
  updatedAt: string;
}

export interface IssueRecord {
  id: string;
  publicationId: string;
  localIssueDate: string;
  editionNumber: number;
  runId: string;
  state: IssueState;
  version: number;
  content: IssueContent | null;
  contentSha256: string | null;
  approvedVersion: number | null;
  approvedSha256: string | null;
  approvedContent: IssueContent | null;
  approvedAt: string | null;
  pdfKey: string | null;
  htmlKey: string | null;
  emailPayloadSha256: string | null;
  sentAt: string | null;
}

export interface SubscriberRecord {
  id: string;
  email: string;
  emailNormalized: string;
  publicationId: string;
  status: 'approved' | 'subscribed' | 'unsubscribed' | 'bounced' | 'suppressed';
  consentTextVersion: string | null;
  consentAt: string | null;
  emailVerifiedAt: string | null;
  isTest: boolean;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export class Repository {
  constructor(
    readonly db: Db,
    private clock: () => Date = () => new Date(),
  ) {}

  now(): string {
    return this.clock().toISOString();
  }

  transaction<T>(fn: () => T): T {
    return tx(this.db, fn);
  }

  // ------------------------------------------------------------ audit
  audit(actor: string, event: string, subjectId?: string, detail?: unknown): void {
    this.db
      .prepare('INSERT INTO audit_log (id, at, actor, event, subject_id, detail) VALUES (?,?,?,?,?,?)')
      .run(newId('audit'), this.now(), actor, event, subjectId ?? null, detail === undefined ? null : j(detail));
  }

  listAudit(subjectId?: string): Row[] {
    return subjectId
      ? (this.db.prepare('SELECT * FROM audit_log WHERE subject_id = ? ORDER BY at').all(subjectId) as Row[])
      : (this.db.prepare('SELECT * FROM audit_log ORDER BY at').all() as Row[]);
  }

  // ------------------------------------------------------------ runs
  createRun(r: Omit<RunRecord, 'id' | 'createdAt' | 'updatedAt' | 'llmCalls' | 'stage' | 'status'>): RunRecord {
    const run: RunRecord = {
      ...r,
      id: newId('run'),
      stage: 'created',
      status: 'running',
      llmCalls: 0,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    this.db
      .prepare(
        `INSERT INTO runs (id, publication_id, local_issue_date, as_of, lookback_hours, prefer_last_hours, provider, stage, status, llm_calls, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(run.id, run.publicationId, run.localIssueDate, run.asOf, run.lookbackHours, run.preferLastHours, run.provider, run.stage, run.status, 0, run.createdAt, run.updatedAt);
    this.audit('engine', 'run.created', run.id, r);
    return run;
  }

  private mapRun(row: Row): RunRecord {
    return {
      id: String(row.id),
      publicationId: String(row.publication_id),
      localIssueDate: String(row.local_issue_date),
      asOf: String(row.as_of),
      lookbackHours: Number(row.lookback_hours),
      preferLastHours: Number(row.prefer_last_hours),
      provider: String(row.provider),
      stage: String(row.stage),
      status: row.status as RunRecord['status'],
      statusDetail: row.status_detail ? String(row.status_detail) : undefined,
      llmCalls: Number(row.llm_calls),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  getRun(id: string): RunRecord {
    const row = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as Row | undefined;
    if (!row) throw new Error(`run ${id} not found`);
    return this.mapRun(row);
  }

  latestRun(publicationId: string, localIssueDate: string): RunRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM runs WHERE publication_id = ? AND local_issue_date = ? ORDER BY created_at DESC, rowid DESC LIMIT 1')
      .get(publicationId, localIssueDate) as Row | undefined;
    return row ? this.mapRun(row) : undefined;
  }

  updateRun(id: string, stage: string, status: RunRecord['status'], detail?: string): void {
    this.db
      .prepare('UPDATE runs SET stage = ?, status = ?, status_detail = ?, updated_at = ? WHERE id = ?')
      .run(stage, status, detail ?? null, this.now(), id);
    this.audit('engine', `run.${stage}.${status}`, id, detail);
  }

  incrementLlmCalls(runId: string): number {
    this.db.prepare('UPDATE runs SET llm_calls = llm_calls + 1 WHERE id = ?').run(runId);
    return Number((this.db.prepare('SELECT llm_calls FROM runs WHERE id = ?').get(runId) as Row).llm_calls);
  }

  // ------------------------------------------------------------ sources
  /** Insert a retrieved source. Identical (url, content hash) retrievals reuse the stored record. */
  upsertSource(doc: SourceDocument): SourceDocument {
    SourceDocument.parse(doc);
    const existing = this.db
      .prepare('SELECT body FROM sources WHERE canonical_url = ? AND content_sha256 = ?')
      .get(doc.canonicalUrl, doc.contentSha256) as Row | undefined;
    if (existing) return p<SourceDocument>(existing.body);
    this.db
      .prepare('INSERT INTO sources (id, canonical_url, content_sha256, retrieval_status, published_at, retrieved_at, body) VALUES (?,?,?,?,?,?,?)')
      .run(doc.id, doc.canonicalUrl, doc.contentSha256, doc.retrievalStatus, doc.publishedAt ?? null, doc.retrievedAt, j(doc));
    return doc;
  }

  linkRunSource(runId: string, sourceId: string): void {
    this.db.prepare('INSERT OR IGNORE INTO run_sources (run_id, source_id) VALUES (?,?)').run(runId, sourceId);
  }

  getSource(id: string): SourceDocument | undefined {
    const row = this.db.prepare('SELECT body FROM sources WHERE id = ?').get(id) as Row | undefined;
    return row ? p<SourceDocument>(row.body) : undefined;
  }

  findSourceByUrl(canonicalUrl: string): SourceDocument | undefined {
    const row = this.db
      .prepare('SELECT body FROM sources WHERE canonical_url = ? ORDER BY retrieved_at DESC LIMIT 1')
      .get(canonicalUrl) as Row | undefined;
    return row ? p<SourceDocument>(row.body) : undefined;
  }

  listRunSources(runId: string): SourceDocument[] {
    return (
      this.db
        .prepare('SELECT s.body FROM sources s JOIN run_sources r ON r.source_id = s.id WHERE r.run_id = ? ORDER BY s.published_at')
        .all(runId) as Row[]
    ).map((r) => p<SourceDocument>(r.body));
  }

  // ------------------------------------------------------------ clusters / claims
  saveCluster(c: EventCluster): void {
    EventCluster.parse(c);
    this.db.prepare('INSERT OR REPLACE INTO clusters (id, run_id, body) VALUES (?,?,?)').run(c.id, c.runId, j(c));
  }

  listClusters(runId: string): EventCluster[] {
    return (this.db.prepare('SELECT body FROM clusters WHERE run_id = ? ORDER BY id').all(runId) as Row[]).map((r) => p<EventCluster>(r.body));
  }

  saveClaim(c: Claim): void {
    const v = Claim.parse(c);
    this.db
      .prepare('INSERT OR REPLACE INTO claims (id, run_id, cluster_id, primary_source_id, support, material, body) VALUES (?,?,?,?,?,?,?)')
      .run(v.id, v.runId, v.clusterId ?? null, v.provenance[0].sourceId, v.support, v.material ? 1 : 0, j(v));
  }

  listClaims(runId: string): Claim[] {
    return (this.db.prepare('SELECT body FROM claims WHERE run_id = ? ORDER BY rowid').all(runId) as Row[]).map((r) => p<Claim>(r.body));
  }

  getClaim(id: string): Claim | undefined {
    const row = this.db.prepare('SELECT body FROM claims WHERE id = ?').get(id) as Row | undefined;
    return row ? p<Claim>(row.body) : undefined;
  }

  getClaims(ids: string[]): Claim[] {
    return ids.map((id) => this.getClaim(id)).filter((c): c is Claim => !!c);
  }

  // ------------------------------------------------------------ signals / consequences / candidates
  saveSignal(s: Signal): void {
    const v = Signal.parse(s);
    this.db
      .prepare('INSERT OR REPLACE INTO signals (id, run_id, cluster_id, editorial_status, candidate_priority, body) VALUES (?,?,?,?,?,?)')
      .run(v.id, v.runId, v.eventClusterId, v.editorialStatus, v.candidatePriority, j(v));
  }

  listSignals(runId: string): Signal[] {
    return (this.db.prepare('SELECT body FROM signals WHERE run_id = ? ORDER BY candidate_priority DESC').all(runId) as Row[]).map((r) => p<Signal>(r.body));
  }

  /** Accepted signals from earlier runs, used for the novelty factor. */
  listPriorAcceptedSignals(beforeRunId: string): Signal[] {
    return (
      this.db
        .prepare(`SELECT s.body FROM signals s JOIN runs r ON r.id = s.run_id WHERE s.editorial_status = 'accepted' AND s.run_id <> ? ORDER BY r.created_at`)
        .all(beforeRunId) as Row[]
    ).map((r) => p<Signal>(r.body));
  }

  saveConsequence(c: Consequence): void {
    const v = Consequence.parse(c);
    this.db.prepare('INSERT OR REPLACE INTO consequences (id, run_id, status, body) VALUES (?,?,?,?)').run(v.id, v.runId, v.status, j(v));
  }

  listConsequences(runId: string): Consequence[] {
    return (this.db.prepare('SELECT body FROM consequences WHERE run_id = ? ORDER BY rowid').all(runId) as Row[]).map((r) => p<Consequence>(r.body));
  }

  saveCandidate(c: PositionCandidate): void {
    const v = PositionCandidate.parse(c);
    this.db.prepare('INSERT OR REPLACE INTO position_candidates (id, run_id, status, body) VALUES (?,?,?,?)').run(v.id, v.runId, v.status, j(v));
  }

  listCandidates(runId: string): PositionCandidate[] {
    return (this.db.prepare('SELECT body FROM position_candidates WHERE run_id = ? ORDER BY rowid').all(runId) as Row[]).map((r) => p<PositionCandidate>(r.body));
  }

  // ------------------------------------------------------------ 012 Continuity Ledger
  reservePositionId(): string {
    const r = this.db.prepare('INSERT INTO position_sequence (reserved_at) VALUES (?)').run(this.now());
    return formatPositionId(Number(r.lastInsertRowid));
  }

  insertPosition(pos: Position, published: boolean): void {
    const v = Position.parse(pos);
    this.db
      .prepare(
        `INSERT INTO positions (id, publication_id, original_thesis, current_status, first_identified_on, initial_issue_id, published, seeded, body, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(v.id, v.publicationId, v.originalThesis, v.currentStatus, v.firstIdentifiedOn, v.initialIssueId ?? null, published ? 1 : 0, v.seeded ? 1 : 0, j(v), v.createdAt);
    this.audit('ledger', 'position.inserted', v.id, { published, seeded: v.seeded });
  }

  getPosition(id: string): (Position & { published: boolean }) | undefined {
    const row = this.db.prepare('SELECT body, published, current_status FROM positions WHERE id = ?').get(id) as Row | undefined;
    if (!row) return undefined;
    return { ...p<Position>(row.body), currentStatus: row.current_status as LedgerStatus, published: Number(row.published) === 1 };
  }

  /** Positions that the ledger tracks: published (or explicitly seeded) and not retired. */
  listLedgerPositions(publicationId: string): Position[] {
    return (
      this.db
        .prepare(`SELECT body, current_status FROM positions WHERE publication_id = ? AND published = 1 AND current_status <> 'RETIRED' ORDER BY id`)
        .all(publicationId) as Row[]
    ).map((r) => ({ ...p<Position>(r.body), currentStatus: r.current_status as LedgerStatus }));
  }

  /** Draft positions may be revised before first publication; afterwards the thesis is locked by trigger. */
  replaceDraftPosition(pos: Position): void {
    const v = Position.parse(pos);
    this.db
      .prepare('UPDATE positions SET original_thesis = ?, current_status = ?, body = ? WHERE id = ? AND published = 0')
      .run(v.originalThesis, v.currentStatus, j(v), v.id);
  }

  findPositionByCandidate(candidateId: string): (Position & { published: boolean }) | undefined {
    const row = this.db.prepare(`SELECT id FROM positions WHERE json_extract(body, '$.candidateId') = ?`).get(candidateId) as Row | undefined;
    return row ? this.getPosition(String(row.id)) : undefined;
  }

  markPositionPublished(id: string, issueId: string): void {
    const cur = this.getPosition(id);
    if (!cur) throw new Error(`position ${id} not found`);
    const body = { ...cur, initialIssueId: issueId } as Position & { published?: boolean };
    delete body.published;
    this.db.prepare('UPDATE positions SET published = 1, initial_issue_id = ?, body = ? WHERE id = ? AND published = 0').run(issueId, j(body), id);
  }

  setPositionStatus(id: string, status: LedgerStatus): void {
    this.db.prepare('UPDATE positions SET current_status = ? WHERE id = ?').run(status, id);
  }

  saveProposal(c: ContinuityProposal): void {
    const v = ContinuityProposal.parse(c);
    this.db
      .prepare('INSERT OR REPLACE INTO continuity_proposals (id, run_id, position_id, status, body) VALUES (?,?,?,?,?)')
      .run(v.id, v.runId, v.positionId, v.status, j(v));
  }

  listProposals(runId: string): ContinuityProposal[] {
    return (this.db.prepare('SELECT body, status FROM continuity_proposals WHERE run_id = ? ORDER BY rowid').all(runId) as Row[]).map((r) => ({
      ...p<ContinuityProposal>(r.body),
      status: r.status as ContinuityProposal['status'],
    }));
  }

  getProposal(id: string): ContinuityProposal | undefined {
    const row = this.db.prepare('SELECT body, status FROM continuity_proposals WHERE id = ?').get(id) as Row | undefined;
    return row ? { ...p<ContinuityProposal>(row.body), status: row.status as ContinuityProposal['status'] } : undefined;
  }

  setProposalStatus(id: string, status: ContinuityProposal['status']): void {
    const cur = this.getProposal(id);
    if (!cur) throw new Error(`proposal ${id} not found`);
    this.db.prepare('UPDATE continuity_proposals SET status = ?, body = ? WHERE id = ?').run(status, j({ ...cur, status }), id);
  }

  linkEvidence(positionId: string, claimId: string, runId: string, relation: string, note: string): void {
    this.db
      .prepare('INSERT OR IGNORE INTO position_evidence_links (position_id, claim_id, run_id, relation, note, created_at) VALUES (?,?,?,?,?,?)')
      .run(positionId, claimId, runId, relation, note, this.now());
  }

  listEvidenceLinks(positionId: string): Row[] {
    return this.db.prepare('SELECT * FROM position_evidence_links WHERE position_id = ? ORDER BY created_at').all(positionId) as Row[];
  }

  /** Append-only. The DB rejects UPDATE/DELETE on revisions. */
  appendRevision(r: Revision): void {
    const v = Revision.parse(r);
    this.transaction(() => {
      const pos = this.getPosition(v.positionId);
      if (!pos) throw new Error(`position ${v.positionId} not found`);
      if (pos.currentStatus !== v.previousStatus)
        throw new Error(`revision previousStatus ${v.previousStatus} does not match ledger status ${pos.currentStatus}`);
      this.db
        .prepare(
          'INSERT INTO position_revisions (id, position_id, issue_id, previous_status, new_status, editor_approval_id, recorded_at, body) VALUES (?,?,?,?,?,?,?,?)',
        )
        .run(v.id, v.positionId, v.issueId ?? null, v.previousStatus, v.newStatus, v.editorApprovalId, v.recordedAt, j(v));
      this.setPositionStatus(v.positionId, v.newStatus as LedgerStatus);
      this.audit('ledger', 'revision.appended', v.positionId, { revisionId: v.id, from: v.previousStatus, to: v.newStatus });
    });
  }

  listRevisions(positionId: string): Revision[] {
    return (this.db.prepare('SELECT body FROM position_revisions WHERE position_id = ? ORDER BY recorded_at, rowid').all(positionId) as Row[]).map((r) =>
      p<Revision>(r.body),
    );
  }

  // ------------------------------------------------------------ issues
  private mapIssue(row: Row): IssueRecord {
    return {
      id: String(row.id),
      publicationId: String(row.publication_id),
      localIssueDate: String(row.local_issue_date),
      editionNumber: Number(row.edition_number),
      runId: String(row.run_id),
      state: row.state as IssueState,
      version: Number(row.version),
      content: row.content ? p<IssueContent>(row.content) : null,
      contentSha256: (row.content_sha256 as string) ?? null,
      approvedVersion: row.approved_version == null ? null : Number(row.approved_version),
      approvedSha256: (row.approved_sha256 as string) ?? null,
      approvedContent: row.approved_content ? p<IssueContent>(row.approved_content) : null,
      approvedAt: (row.approved_at as string) ?? null,
      pdfKey: (row.pdf_key as string) ?? null,
      htmlKey: (row.html_key as string) ?? null,
      emailPayloadSha256: (row.email_payload_sha256 as string) ?? null,
      sentAt: (row.sent_at as string) ?? null,
    };
  }

  nextEditionNumber(publicationId: string): number {
    const row = this.db.prepare(`SELECT COUNT(*) n FROM issues WHERE publication_id = ? AND state IN ('SENT','CORRECTED')`).get(publicationId) as Row;
    return Number(row.n) + 1;
  }

  createIssue(publicationId: string, localIssueDate: string, runId: string): IssueRecord {
    const existing = this.getIssueByDate(publicationId, localIssueDate);
    if (existing) {
      if (['SENT', 'CORRECTED', 'SEND_READY'].includes(existing.state))
        throw new Error(`issue for ${localIssueDate} already ${existing.state}; it cannot be re-prepared`);
      // A new research run for the same local date restarts the issue record (draft only).
      this.db.prepare('UPDATE issues SET run_id = ?, updated_at = ? WHERE id = ?').run(runId, this.now(), existing.id);
      this.forceState(existing.id, 'COLLECTED', 'engine', `re-prepared by run ${runId}`);
      return this.getIssue(existing.id);
    }
    const id = newId('issue');
    this.db
      .prepare(
        `INSERT INTO issues (id, publication_id, local_issue_date, edition_number, run_id, state, version, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .run(id, publicationId, localIssueDate, this.nextEditionNumber(publicationId), runId, 'COLLECTED', 0, this.now(), this.now());
    this.logState(id, null, 'COLLECTED', 'engine', `created by run ${runId}`);
    return this.getIssue(id);
  }

  getIssue(id: string): IssueRecord {
    const row = this.db.prepare('SELECT * FROM issues WHERE id = ?').get(id) as Row | undefined;
    if (!row) throw new Error(`issue ${id} not found`);
    return this.mapIssue(row);
  }

  getIssueByDate(publicationId: string, localIssueDate: string): IssueRecord | undefined {
    const row = this.db.prepare('SELECT * FROM issues WHERE publication_id = ? AND local_issue_date = ?').get(publicationId, localIssueDate) as
      | Row
      | undefined;
    return row ? this.mapIssue(row) : undefined;
  }

  private logState(issueId: string, from: string | null, to: string, actor: string, note?: string) {
    this.db
      .prepare('INSERT INTO issue_state_log (issue_id, from_state, to_state, actor, note, at) VALUES (?,?,?,?,?,?)')
      .run(issueId, from, to, actor, note ?? null, this.now());
    this.audit(actor, `issue.${to}`, issueId, note);
  }

  listIssueStateLog(issueId: string): Row[] {
    return this.db.prepare('SELECT * FROM issue_state_log WHERE issue_id = ? ORDER BY rowid').all(issueId) as Row[];
  }

  transitionIssue(issueId: string, to: IssueState, actor: string, note?: string): IssueRecord {
    const cur = this.getIssue(issueId);
    assertTransition(cur.state, to);
    this.db.prepare('UPDATE issues SET state = ?, updated_at = ? WHERE id = ?').run(to, this.now(), issueId);
    this.logState(issueId, cur.state, to, actor, note);
    return this.getIssue(issueId);
  }

  /** Only used when a new research run restarts an unsent draft. */
  private forceState(issueId: string, to: IssueState, actor: string, note: string) {
    const cur = this.getIssue(issueId);
    this.db
      .prepare('UPDATE issues SET state = ?, content = NULL, content_sha256 = NULL, approved_version = NULL, approved_sha256 = NULL, approved_content = NULL, approved_at = NULL, pdf_key = NULL, html_key = NULL, updated_at = ? WHERE id = ?')
      .run(to, this.now(), issueId);
    this.logState(issueId, cur.state, to, actor, note);
  }

  /**
   * Store new draft content. Any change after approval voids the approval:
   * the issue returns to DRAFTED and requires reapproval.
   */
  setIssueContent(issueId: string, content: IssueContent, actor: string): IssueRecord {
    return this.transaction(() => {
      const cur = this.getIssue(issueId);
      const version = cur.version + 1;
      const next = IssueContent.parse({ ...content, version, issueId });
      const sha = hashJson(next);
      this.db.prepare('UPDATE issues SET content = ?, content_sha256 = ?, version = ?, updated_at = ? WHERE id = ?').run(j(next), sha, version, this.now(), issueId);
      if (['EDITOR_APPROVED', 'RENDERED'].includes(cur.state)) {
        this.db.prepare('UPDATE issues SET approved_version = NULL, approved_sha256 = NULL, approved_content = NULL, approved_at = NULL, pdf_key = NULL, html_key = NULL WHERE id = ?').run(issueId);
        this.transitionIssue(issueId, 'DRAFTED', actor, `content changed after approval (v${version}); reapproval required`);
      }
      this.audit(actor, 'issue.content', issueId, { version, sha });
      return this.getIssue(issueId);
    });
  }

  recordApproval(a: {
    issueId: string;
    issueVersion: number;
    contentSha256: string;
    editor: string;
    decision: 'approve' | 'request_revision' | 'hold';
    note?: string;
    manifestSha256?: string;
  }): string {
    const id = newId('approval');
    this.db
      .prepare('INSERT INTO approvals (id, issue_id, issue_version, content_sha256, editor, decision, note, manifest_sha256, decided_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, a.issueId, a.issueVersion, a.contentSha256, a.editor, a.decision, a.note ?? null, a.manifestSha256 ?? null, this.now());
    this.audit(a.editor, `approval.${a.decision}`, a.issueId, { approvalId: id, version: a.issueVersion, sha: a.contentSha256 });
    return id;
  }

  listApprovals(issueId: string): Row[] {
    return this.db.prepare('SELECT * FROM approvals WHERE issue_id = ? ORDER BY decided_at, rowid').all(issueId) as Row[];
  }

  lockApprovedSnapshot(issueId: string, content: IssueContent, sha: string): void {
    this.db
      .prepare('UPDATE issues SET approved_version = ?, approved_sha256 = ?, approved_content = ?, approved_at = ?, updated_at = ? WHERE id = ?')
      .run(content.version, sha, j(content), this.now(), this.now(), issueId);
  }

  setRenderedKeys(issueId: string, keys: { pdfKey: string; htmlKey: string; emailPayloadSha256: string }): void {
    this.db
      .prepare('UPDATE issues SET pdf_key = ?, html_key = ?, email_payload_sha256 = ?, updated_at = ? WHERE id = ?')
      .run(keys.pdfKey, keys.htmlKey, keys.emailPayloadSha256, this.now(), issueId);
  }

  markSent(issueId: string): void {
    this.db.prepare('UPDATE issues SET sent_at = ? WHERE id = ?').run(this.now(), issueId);
  }

  addCorrection(issueId: string, localDate: string, text: string, material: boolean, editor: string): void {
    this.db
      .prepare('INSERT INTO corrections (id, issue_id, local_date, text, material, editor, created_at) VALUES (?,?,?,?,?,?,?)')
      .run(newId('audit'), issueId, localDate, text, material ? 1 : 0, editor, this.now());
  }

  // ------------------------------------------------------------ subscribers & delivery
  addSubscriber(s: {
    email: string;
    publicationId: string;
    status: SubscriberRecord['status'];
    consentTextVersion?: string;
    consentAt?: string;
    emailVerifiedAt?: string;
    isTest?: boolean;
  }): SubscriberRecord {
    const id = newId('subscriber');
    this.db
      .prepare(
        `INSERT INTO subscribers (id, email_normalized, email, publication_id, status, consent_text_version, consent_at, email_verified_at, is_test, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(id, normalizeEmail(s.email), s.email.trim(), s.publicationId, s.status, s.consentTextVersion ?? null, s.consentAt ?? null, s.emailVerifiedAt ?? null, s.isTest ? 1 : 0, this.now(), this.now());
    this.audit('operator', 'subscriber.added', id, { status: s.status, isTest: !!s.isTest });
    return this.getSubscriber(id)!;
  }

  private mapSub(row: Row): SubscriberRecord {
    return {
      id: String(row.id),
      email: String(row.email),
      emailNormalized: String(row.email_normalized),
      publicationId: String(row.publication_id),
      status: row.status as SubscriberRecord['status'],
      consentTextVersion: (row.consent_text_version as string) ?? null,
      consentAt: (row.consent_at as string) ?? null,
      emailVerifiedAt: (row.email_verified_at as string) ?? null,
      isTest: Number(row.is_test) === 1,
    };
  }

  getSubscriber(id: string): SubscriberRecord | undefined {
    const row = this.db.prepare('SELECT * FROM subscribers WHERE id = ?').get(id) as Row | undefined;
    return row ? this.mapSub(row) : undefined;
  }

  listSubscribers(publicationId: string): SubscriberRecord[] {
    return (this.db.prepare('SELECT * FROM subscribers WHERE publication_id = ? ORDER BY created_at').all(publicationId) as Row[]).map((r) => this.mapSub(r));
  }

  /**
   * Eligible recipients: subscribed/approved, consent recorded, email verified,
   * not suppressed. Unsubscribed or bounced readers are never returned.
   */
  listEligibleRecipients(publicationId: string, opts: { testOnly: boolean }): SubscriberRecord[] {
    const rows = this.db
      .prepare(
        `SELECT s.* FROM subscribers s
         WHERE s.publication_id = ? AND s.status IN ('approved','subscribed')
           AND s.consent_at IS NOT NULL AND s.email_verified_at IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM suppressions x WHERE x.email_normalized = s.email_normalized)
           ${opts.testOnly ? 'AND s.is_test = 1' : ''}
         ORDER BY s.created_at`,
      )
      .all(publicationId) as Row[];
    return rows.map((r) => this.mapSub(r));
  }

  setSubscriberStatus(id: string, status: SubscriberRecord['status'], reason: string): void {
    this.transaction(() => {
      this.db.prepare('UPDATE subscribers SET status = ?, updated_at = ? WHERE id = ?').run(status, this.now(), id);
      if (['unsubscribed', 'bounced', 'suppressed'].includes(status)) {
        const s = this.getSubscriber(id)!;
        this.db.prepare('INSERT OR REPLACE INTO suppressions (email_normalized, reason, created_at) VALUES (?,?,?)').run(s.emailNormalized, `${status}: ${reason}`, this.now());
      }
      this.audit('operator', `subscriber.${status}`, id, reason);
    });
  }

  getDispatchByIssue(issueId: string): Row | undefined {
    return this.db.prepare('SELECT * FROM dispatches WHERE issue_id = ?').get(issueId) as Row | undefined;
  }

  getDispatchByDate(publicationId: string, localIssueDate: string): Row | undefined {
    return this.db.prepare('SELECT * FROM dispatches WHERE publication_id = ? AND local_issue_date = ?').get(publicationId, localIssueDate) as Row | undefined;
  }

  /** Returns the dispatch row; `created` is false when a dispatch for this local date already existed. */
  claimDispatch(d: { issueId: string; publicationId: string; localIssueDate: string; approvedSha256: string; mailer: string }): { row: Row; created: boolean } {
    return this.transaction(() => {
      const existing = this.getDispatchByDate(d.publicationId, d.localIssueDate);
      if (existing) return { row: existing, created: false };
      const id = newId('dispatch');
      this.db
        .prepare(
          `INSERT INTO dispatches (id, issue_id, publication_id, local_issue_date, broadcast_key, approved_sha256, mailer, status, started_at) VALUES (?,?,?,?,?,?,?,?,?)`,
        )
        .run(id, d.issueId, d.publicationId, d.localIssueDate, `${d.publicationId}:${d.localIssueDate}`, d.approvedSha256, d.mailer, 'in_progress', this.now());
      this.audit('publishing', 'dispatch.claimed', d.issueId, { dispatchId: id });
      return { row: this.getDispatchByIssue(d.issueId)!, created: true };
    });
  }

  setDispatchStatus(id: string, status: 'in_progress' | 'complete' | 'partial'): void {
    this.db.prepare('UPDATE dispatches SET status = ?, completed_at = ? WHERE id = ?').run(status, status === 'complete' ? this.now() : null, id);
  }

  ensureDelivery(dispatchId: string, subscriberId: string, idempotencyKey: string): Row {
    this.db
      .prepare('INSERT OR IGNORE INTO deliveries (id, dispatch_id, subscriber_id, idempotency_key, status, attempts, last_event_at) VALUES (?,?,?,?,?,?,?)')
      .run(newId('delivery'), dispatchId, subscriberId, idempotencyKey, 'pending', 0, this.now());
    return this.db.prepare('SELECT * FROM deliveries WHERE dispatch_id = ? AND subscriber_id = ?').get(dispatchId, subscriberId) as Row;
  }

  updateDelivery(id: string, status: 'pending' | 'sent' | 'failed' | 'skipped', fields: { providerMessageId?: string; error?: string }): void {
    this.db
      .prepare('UPDATE deliveries SET status = ?, provider_message_id = COALESCE(?, provider_message_id), last_error = ?, attempts = attempts + 1, last_event_at = ? WHERE id = ?')
      .run(status, fields.providerMessageId ?? null, fields.error ?? null, this.now(), id);
  }

  listDeliveries(dispatchId: string): Row[] {
    return this.db.prepare('SELECT * FROM deliveries WHERE dispatch_id = ? ORDER BY rowid').all(dispatchId) as Row[];
  }

  // ------------------------------------------------------------ LLM audit
  recordLlmCall(c: {
    runId?: string;
    task: string;
    promptVersion: string;
    provider: string;
    model: string;
    inputSha256: string;
    output: unknown;
    attempts: number;
    usage?: unknown;
    startedAt: string;
    finishedAt: string;
  }): string {
    const id = newId('llmCall');
    this.db
      .prepare(
        'INSERT INTO llm_calls (id, run_id, task, prompt_version, provider, model, input_sha256, output, attempts, usage, started_at, finished_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(id, c.runId ?? null, c.task, c.promptVersion, c.provider, c.model, c.inputSha256, j(c.output), c.attempts, c.usage ? j(c.usage) : null, c.startedAt, c.finishedAt);
    return id;
  }

  listLlmCalls(runId: string): Row[] {
    return this.db.prepare('SELECT id, task, prompt_version, provider, model, input_sha256, attempts, started_at, finished_at FROM llm_calls WHERE run_id = ? ORDER BY rowid').all(runId) as Row[];
  }
}
