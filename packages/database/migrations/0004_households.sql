-- Migration number: 0004
-- Households, membership, locations, and profiles.active_household_id.
-- Portable SQLite / D1. Does not create invitation or inventory tables.
--
-- active_household_id uses ALTER TABLE ADD COLUMN. D1 documents adding a
-- FOREIGN KEY when adding a column, and current SQLite records
-- REFERENCES ... ON DELETE SET NULL without rebuilding profiles.
-- Invites are deferred until household sharing.

CREATE TABLE households (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE household_members (
  household_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (household_id, user_id),
  FOREIGN KEY (household_id) REFERENCES households (id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES "user" (id) ON DELETE CASCADE
);

CREATE INDEX household_members_user_id_idx ON household_members (user_id);

CREATE TABLE locations (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES households (id) ON DELETE CASCADE
);

CREATE INDEX locations_household_id_idx ON locations (household_id);

CREATE UNIQUE INDEX locations_household_active_normalized_name_idx
  ON locations (household_id, normalized_name)
  WHERE is_active = 1;

ALTER TABLE profiles
  ADD COLUMN active_household_id TEXT REFERENCES households (id) ON DELETE SET NULL;
