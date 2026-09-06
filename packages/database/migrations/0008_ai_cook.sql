-- Migration number: 0008
-- AI Cook MVP: generated recipes, snapshot ingredients, Pantry-calculated
-- nutrition, cook records, and per-user generation rate limits.
-- Portable SQLite / D1. Does not create chatbot, OCR, shopping-from-recipe,
-- or analytics tables.

CREATE TABLE recipes (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NULL,
  servings INTEGER NOT NULL CHECK (servings > 0),
  time_minutes INTEGER NULL,
  instructions_json TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('ai')),
  ai_model TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES households (id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES "user" (id)
);

CREATE INDEX recipes_household_created_idx ON recipes (household_id, created_at DESC);

CREATE TABLE recipe_ingredients (
  recipe_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  product_id TEXT NULL,
  product_name TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL CHECK (unit IN ('g', 'ml', 'each', 'package')),
  PRIMARY KEY (recipe_id, position),
  FOREIGN KEY (recipe_id) REFERENCES recipes (id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL
);

CREATE INDEX recipe_ingredients_product_id_idx ON recipe_ingredients (product_id);

CREATE TABLE recipe_nutrition (
  recipe_id TEXT PRIMARY KEY,
  energy_kcal_total REAL NULL,
  protein_g_total REAL NULL,
  carbohydrates_g_total REAL NULL,
  fat_g_total REAL NULL,
  energy_kcal_per_serving REAL NULL,
  protein_g_per_serving REAL NULL,
  carbohydrates_g_per_serving REAL NULL,
  fat_g_per_serving REAL NULL,
  calculable_ingredients INTEGER NOT NULL,
  total_ingredients INTEGER NOT NULL,
  is_complete INTEGER NOT NULL CHECK (is_complete IN (0, 1)),
  calculated_at TEXT NOT NULL,
  FOREIGN KEY (recipe_id) REFERENCES recipes (id) ON DELETE CASCADE
);

CREATE TABLE recipe_cooks (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (recipe_id) REFERENCES recipes (id) ON DELETE CASCADE,
  FOREIGN KEY (household_id) REFERENCES households (id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES "user" (id)
);

CREATE INDEX recipe_cooks_recipe_id_idx ON recipe_cooks (recipe_id);
CREATE INDEX recipe_cooks_household_created_idx ON recipe_cooks (household_id, created_at DESC);

CREATE TABLE ai_rate_limits (
  user_id TEXT NOT NULL,
  window_start TEXT NOT NULL,
  count INTEGER NOT NULL CHECK (count >= 0),
  PRIMARY KEY (user_id, window_start),
  FOREIGN KEY (user_id) REFERENCES "user" (id) ON DELETE CASCADE
);
