-- Migration number: 0006
-- Open Facts barcode metadata and source nutrition.
-- Does not rebuild inventory tables. Existing lots and products survive.
--
-- products.source = 'open_food_facts' remains the historical Open Facts
-- external import path (CHECK is not renamed). external_catalog is the
-- authoritative catalog identifier (open_food_facts vs open_products_facts).
-- Image URLs stay external; bytes are not stored.

ALTER TABLE products ADD COLUMN image_url TEXT NULL;
ALTER TABLE products ADD COLUMN external_catalog TEXT NULL
  CHECK (external_catalog IS NULL OR external_catalog IN ('open_food_facts', 'open_products_facts'));
ALTER TABLE products ADD COLUMN external_product_type TEXT NULL;
ALTER TABLE products ADD COLUMN package_quantity REAL NULL;
ALTER TABLE products ADD COLUMN package_unit TEXT NULL
  CHECK (package_unit IS NULL OR package_unit IN ('g', 'ml', 'each', 'package'));
ALTER TABLE products ADD COLUMN external_fetched_at TEXT NULL;

CREATE TABLE product_nutrition (
  product_id TEXT PRIMARY KEY,
  energy_kcal_100g REAL NULL,
  protein_g_100g REAL NULL,
  carbohydrates_g_100g REAL NULL,
  fat_g_100g REAL NULL,
  sugars_g_100g REAL NULL,
  fiber_g_100g REAL NULL,
  salt_g_100g REAL NULL,
  serving_size TEXT NULL,
  energy_kcal_serving REAL NULL,
  protein_g_serving REAL NULL,
  carbohydrates_g_serving REAL NULL,
  fat_g_serving REAL NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
);
