-- 012 MEDIA — invitation journey (PRD §6): applications, email verification,
-- manual review and the founding cohort. Only approved, consented, verified
-- readers ever become subscribers.

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  email_normalized TEXT NOT NULL UNIQUE,   -- case-insensitive dedupe
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role_title TEXT NOT NULL,
  industry TEXT NOT NULL,
  linkedin_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('applied','email_verified','pending_review','approved','declined','waitlisted','withdrawn')),
  consent_text_version TEXT NOT NULL,
  consent_text_sha256 TEXT NOT NULL,
  consent_at TEXT NOT NULL,
  email_verified_at TEXT,
  application_date TEXT NOT NULL,
  reviewer TEXT,
  review_date TEXT,
  review_note TEXT,
  subscriber_id TEXT,
  updated_at TEXT NOT NULL
);

-- Single-use, expiring verification tokens; only the hash is stored.
CREATE TABLE IF NOT EXISTS verification_tokens (
  token_sha256 TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id),
  purpose TEXT NOT NULL CHECK (purpose IN ('verify_email')),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

-- Founding cohort: at most 500 seats, enforced by the database itself.
CREATE TABLE IF NOT EXISTS founding_seats (
  seat INTEGER PRIMARY KEY CHECK (seat BETWEEN 1 AND 500),
  subscriber_id TEXT NOT NULL UNIQUE REFERENCES subscribers(id),
  application_id TEXT NOT NULL UNIQUE REFERENCES applications(id),
  entitlement TEXT NOT NULL,
  granted_at TEXT NOT NULL
);

-- Public specimen edition shown on /brief (must be an approved issue).
CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
