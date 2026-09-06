-- Migration number: 0007
-- Household shopping list MVP: one active list per household, product-backed
-- and free-text items. Checking an item does not write inventory.
-- Portable SQLite / D1. Does not create receipt, history-UI, or min-stock tables.

CREATE TABLE shopping_lists (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES households (id) ON DELETE CASCADE
);

CREATE INDEX shopping_lists_household_id_idx ON shopping_lists (household_id);

CREATE UNIQUE INDEX shopping_lists_household_active_idx
  ON shopping_lists (household_id)
  WHERE status = 'active';

CREATE TABLE shopping_items (
  id TEXT PRIMARY KEY,
  shopping_list_id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  product_id TEXT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  quantity REAL NULL CHECK (quantity IS NULL OR quantity > 0),
  unit TEXT NULL CHECK (unit IS NULL OR unit IN ('g', 'ml', 'each', 'package')),
  is_checked INTEGER NOT NULL DEFAULT 0 CHECK (is_checked IN (0, 1)),
  checked_at TEXT NULL,
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (shopping_list_id) REFERENCES shopping_lists (id) ON DELETE CASCADE,
  FOREIGN KEY (household_id) REFERENCES households (id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES "user" (id)
);

CREATE INDEX shopping_items_shopping_list_id_idx ON shopping_items (shopping_list_id);

CREATE INDEX shopping_items_household_id_idx ON shopping_items (household_id);

CREATE UNIQUE INDEX shopping_items_list_unchecked_product_idx
  ON shopping_items (shopping_list_id, product_id)
  WHERE product_id IS NOT NULL AND is_checked = 0;
