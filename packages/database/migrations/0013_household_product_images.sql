-- Migration number: 0013
-- Household-specific product display image override.
-- Catalog products.image_url is never overwritten. Bytes live in private R2;
-- D1 stores only the object key and metadata.
--
-- R2 and D1 are not one transaction. Replacement order in the Worker:
-- upload the new object, update this row, then best-effort-delete the old
-- object. A leftover orphan in R2 is preferable to a broken product image.
--
-- Portable SQLite / D1. Do not set PRAGMA foreign_keys.

CREATE TABLE household_product_images (
  household_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, product_id),
  FOREIGN KEY (household_id) REFERENCES households (id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES "user" (id)
);

CREATE INDEX household_product_images_product_id_idx
  ON household_product_images (product_id);
