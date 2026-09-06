-- Migration number: 0005
-- Household inventory MVP: products, lots, history, and a persistence-only
-- consumption conflict guard.
-- Portable SQLite / D1. Does not create barcode, shopping, or AI tables.

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  household_id TEXT NULL,
  barcode TEXT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  brand TEXT NULL,
  default_unit TEXT NOT NULL CHECK (default_unit IN ('g', 'ml', 'each', 'package')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'open_food_facts')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES households (id) ON DELETE CASCADE
);

CREATE INDEX products_household_id_idx ON products (household_id);

CREATE INDEX products_household_normalized_name_idx
  ON products (household_id, normalized_name);

CREATE INDEX products_barcode_idx ON products (barcode);

CREATE UNIQUE INDEX products_global_barcode_idx
  ON products (barcode)
  WHERE household_id IS NULL AND barcode IS NOT NULL;

CREATE UNIQUE INDEX products_household_barcode_idx
  ON products (household_id, barcode)
  WHERE household_id IS NOT NULL AND barcode IS NOT NULL;

CREATE TABLE inventory_lots (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  expires_on TEXT NULL,
  expires_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES households (id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES locations (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX inventory_lots_household_product_location_expires_idx
  ON inventory_lots (household_id, product_id, location_id, expires_key);

CREATE INDEX inventory_lots_household_product_idx
  ON inventory_lots (household_id, product_id);

CREATE TABLE inventory_history (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('add', 'consume', 'adjust')),
  delta_quantity REAL NOT NULL CHECK (delta_quantity != 0),
  unit TEXT NOT NULL CHECK (unit IN ('g', 'ml', 'each', 'package')),
  expires_on TEXT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES households (id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES locations (id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES "user" (id) ON DELETE CASCADE
);

CREATE INDEX inventory_history_household_created_idx
  ON inventory_history (household_id, created_at DESC);

CREATE INDEX inventory_history_household_product_idx
  ON inventory_history (household_id, product_id);

CREATE TABLE inventory_settings (
  household_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  minimum_quantity REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, product_id),
  FOREIGN KEY (household_id) REFERENCES households (id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
);

-- Persistence-only consumption guard.
-- INSERT is attempted only when a lot precondition is stale. The CHECK always
-- fails, which raises a real SQL error and aborts the surrounding D1/SQLite
-- batch. A successful statement that affects 0 rows does not roll back a batch.
CREATE TABLE inventory_conflict_abort (
  reason TEXT NOT NULL,
  _must_fail INTEGER NOT NULL DEFAULT 0 CHECK (_must_fail = 1)
);
