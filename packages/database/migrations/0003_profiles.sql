-- Migration number: 0003
-- Pantry application profile, 1:1 with Better Auth "user".
-- Better Auth remains authentication identity. profiles holds Pantry-specific data.
--
-- Intentionally omitted: active_household_id.
-- households does not exist until Phase 2. A later migration will add:
--   active_household_id TEXT NULL REFERENCES households(id) ON DELETE SET NULL
-- Do not add a placeholder household FK here.
--
-- Portable SQLite. Does not modify Better Auth tables. No triggers.

CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  locale TEXT NOT NULL DEFAULT 'ro',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (id) REFERENCES "user" ("id") ON DELETE CASCADE
);
