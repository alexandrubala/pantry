-- Migration number: 0010
-- Household sharing: invite links identified by SHA-256(token). Raw tokens
-- are never stored. Role is member-only for this slice.
-- Portable SQLite / D1. Do not set PRAGMA foreign_keys.

CREATE TABLE invites (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member')),
  expires_at TEXT NOT NULL,
  accepted_at TEXT NULL,
  revoked_at TEXT NULL,
  accepted_by_user_id TEXT NULL,
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES households (id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES "user" (id),
  FOREIGN KEY (accepted_by_user_id) REFERENCES "user" (id)
);

CREATE INDEX invites_household_pending_idx
  ON invites (household_id, created_at)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
