-- Migration number: 0009
-- Product polish: allow inventory_history.action = 'move' and add an expiry
-- lookup index. SQLite CHECK constraints cannot be altered in place, so
-- inventory_history is rebuilt and existing rows are copied. No rows are
-- deleted. inventory_settings is unchanged.
--
-- Portable SQLite / D1. Do not set PRAGMA foreign_keys.

PRAGMA defer_foreign_keys = ON;

CREATE TABLE inventory_history_new (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('add', 'consume', 'adjust', 'move')),
  delta_quantity REAL NOT NULL CHECK (delta_quantity != 0),
  unit TEXT NOT NULL CHECK (unit IN ('g', 'ml', 'each', 'package')),
  expires_on TEXT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES households (id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES locations (id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES "user" (id) ON DELETE CASCADE
);

INSERT INTO inventory_history_new (
  id, household_id, product_id, location_id, user_id, action, delta_quantity, unit, expires_on, created_at
)
SELECT
  id, household_id, product_id, location_id, user_id, action, delta_quantity, unit, expires_on, created_at
FROM inventory_history;

DROP TABLE inventory_history;

ALTER TABLE inventory_history_new RENAME TO inventory_history;

CREATE INDEX inventory_history_household_created_idx
  ON inventory_history (household_id, created_at DESC);

CREATE INDEX inventory_history_household_product_idx
  ON inventory_history (household_id, product_id);

CREATE INDEX inventory_lots_household_expires_idx
  ON inventory_lots (household_id, expires_on);

PRAGMA foreign_key_check;
