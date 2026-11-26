-- 012 MEDIA — 012 Intelligence Engine, Continuity Ledger and Publishing Engine
-- SQLite dialect (compatible with Cloudflare D1). Structured records are kept
-- in a JSON `body` column validated by the Zod contracts; columns that carry
-- relationships, uniqueness or safety invariants are promoted to real columns.

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL,
  local_issue_date TEXT NOT NULL,
  as_of TEXT NOT NULL,
  lookback_hours INTEGER NOT NULL,
  prefer_last_hours INTEGER NOT NULL,
  provider TEXT NOT NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL,          -- running | held | drafted | failed | quiet
  status_detail TEXT,
  llm_calls INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS runs_by_date ON runs(publication_id, local_issue_date);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  canonical_url TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  retrieval_status TEXT NOT NULL,
  published_at TEXT,
  retrieved_at TEXT NOT NULL,
  body TEXT NOT NULL,
  UNIQUE (canonical_url, content_sha256)
);

CREATE TABLE IF NOT EXISTS run_sources (
  run_id TEXT NOT NULL REFERENCES runs(id),
  source_id TEXT NOT NULL REFERENCES sources(id),
  PRIMARY KEY (run_id, source_id)
);

CREATE TABLE IF NOT EXISTS clusters (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  body TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  cluster_id TEXT,
  primary_source_id TEXT NOT NULL REFERENCES sources(id),
  support TEXT NOT NULL CHECK (support IN ('supported','qualified','contradicted','unverified')),
  material INTEGER NOT NULL,
  body TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS claims_by_run ON claims(run_id);

CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  cluster_id TEXT NOT NULL REFERENCES clusters(id),
  editorial_status TEXT NOT NULL,
  candidate_priority REAL NOT NULL,
  body TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS consequences (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  status TEXT NOT NULL,
  body TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS position_candidates (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  status TEXT NOT NULL,
  body TEXT NOT NULL
);

-- 012 Continuity Ledger --------------------------------------------------------

CREATE TABLE IF NOT EXISTS position_sequence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reserved_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS positions (
  id TEXT PRIMARY KEY CHECK (id GLOB 'POS-[0-9][0-9][0-9][0-9][0-9][0-9]'),
  publication_id TEXT NOT NULL,
  original_thesis TEXT NOT NULL,
  current_status TEXT NOT NULL,
  first_identified_on TEXT NOT NULL,
  initial_issue_id TEXT,
  published INTEGER NOT NULL DEFAULT 0,  -- 1 once its first issue is approved (or seeded)
  seeded INTEGER NOT NULL DEFAULT 0,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- The original thesis is immutable once the position has been published.
CREATE TRIGGER IF NOT EXISTS positions_thesis_immutable
BEFORE UPDATE OF original_thesis ON positions
WHEN OLD.published = 1 AND NEW.original_thesis IS NOT OLD.original_thesis
BEGIN
  SELECT RAISE(ABORT, 'original thesis is immutable after publication');
END;

CREATE TRIGGER IF NOT EXISTS positions_no_delete_published
BEFORE DELETE ON positions
WHEN OLD.published = 1
BEGIN
  SELECT RAISE(ABORT, 'published positions cannot be deleted');
END;

CREATE TABLE IF NOT EXISTS continuity_proposals (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  position_id TEXT NOT NULL REFERENCES positions(id),
  status TEXT NOT NULL,
  body TEXT NOT NULL
);

-- Evidence linked to a position without altering its status ("merely adjacent").
CREATE TABLE IF NOT EXISTS position_evidence_links (
  position_id TEXT NOT NULL REFERENCES positions(id),
  claim_id TEXT NOT NULL REFERENCES claims(id),
  run_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (position_id, claim_id)
);

CREATE TABLE IF NOT EXISTS position_revisions (
  id TEXT PRIMARY KEY,
  position_id TEXT NOT NULL REFERENCES positions(id),
  issue_id TEXT,
  previous_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  editor_approval_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  body TEXT NOT NULL,
  CHECK (previous_status <> new_status)
);

CREATE TRIGGER IF NOT EXISTS revisions_append_only_update
BEFORE UPDATE ON position_revisions
BEGIN
  SELECT RAISE(ABORT, 'position revisions are append-only');
END;

CREATE TRIGGER IF NOT EXISTS revisions_append_only_delete
BEFORE DELETE ON position_revisions
BEGIN
  SELECT RAISE(ABORT, 'position revisions are append-only');
END;

-- Editorial issues ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL,
  local_issue_date TEXT NOT NULL,
  edition_number INTEGER NOT NULL,
  run_id TEXT NOT NULL REFERENCES runs(id),
  state TEXT NOT NULL,
  version INTEGER NOT NULL,
  content TEXT,                 -- current draft IssueContent JSON
  content_sha256 TEXT,
  approved_version INTEGER,
  approved_sha256 TEXT,
  approved_content TEXT,        -- immutable snapshot rendered by the Publishing Engine
  approved_at TEXT,
  pdf_key TEXT,
  html_key TEXT,
  email_payload_sha256 TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (publication_id, local_issue_date)
);

CREATE TABLE IF NOT EXISTS issue_state_log (
  issue_id TEXT NOT NULL REFERENCES issues(id),
  from_state TEXT,
  to_state TEXT NOT NULL,
  actor TEXT NOT NULL,
  note TEXT,
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES issues(id),
  issue_version INTEGER NOT NULL,
  content_sha256 TEXT NOT NULL,
  editor TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approve','request_revision','hold')),
  note TEXT,
  manifest_sha256 TEXT,
  decided_at TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS approvals_append_only
BEFORE UPDATE ON approvals
BEGIN
  SELECT RAISE(ABORT, 'approval records are append-only');
END;

CREATE TABLE IF NOT EXISTS corrections (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES issues(id),
  local_date TEXT NOT NULL,
  text TEXT NOT NULL,
  material INTEGER NOT NULL,
  editor TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Reader delivery ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS subscribers (
  id TEXT PRIMARY KEY,
  email_normalized TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  publication_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('approved','subscribed','unsubscribed','bounced','suppressed')),
  consent_text_version TEXT,
  consent_at TEXT,
  email_verified_at TEXT,
  founding_cohort INTEGER NOT NULL DEFAULT 0,
  is_test INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS suppressions (
  email_normalized TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Exactly one dispatch per publication per local issue date.
CREATE TABLE IF NOT EXISTS dispatches (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL UNIQUE REFERENCES issues(id),
  publication_id TEXT NOT NULL,
  local_issue_date TEXT NOT NULL,
  broadcast_key TEXT NOT NULL UNIQUE,
  approved_sha256 TEXT NOT NULL,
  mailer TEXT NOT NULL,
  status TEXT NOT NULL,         -- in_progress | complete | partial
  started_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (publication_id, local_issue_date)
);

CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,
  dispatch_id TEXT NOT NULL REFERENCES dispatches(id),
  subscriber_id TEXT NOT NULL REFERENCES subscribers(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,         -- pending | sent | failed | skipped
  provider_message_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_event_at TEXT NOT NULL,
  UNIQUE (dispatch_id, subscriber_id)
);

-- Reproducibility & audit --------------------------------------------------------

CREATE TABLE IF NOT EXISTS llm_calls (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  task TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_sha256 TEXT NOT NULL,
  output TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  usage TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS llm_calls_lookup ON llm_calls(task, prompt_version, input_sha256);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  event TEXT NOT NULL,
  subject_id TEXT,
  detail TEXT
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);
