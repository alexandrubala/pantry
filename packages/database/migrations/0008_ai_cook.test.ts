import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { expect, test } from 'vitest'

const migrations = join(dirname(fileURLToPath(import.meta.url)), '../migrations')

function apply(db: DatabaseSync, file: string) {
  db.exec(readFileSync(join(migrations, file), 'utf8'))
}

function seedHousehold(db: DatabaseSync) {
  db.exec(
    `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
     VALUES ('user-1', 'Alex', 'alex@example.invalid', 0, datetime('now'), datetime('now'))`,
  )
  db.exec(
    `INSERT INTO households (id, name, created_at, updated_at)
     VALUES ('h1', 'Casa', datetime('now'), datetime('now'))`,
  )
  db.exec(
    `INSERT INTO household_members (household_id, user_id, role, created_at)
     VALUES ('h1', 'user-1', 'owner', datetime('now'))`,
  )
}

test('0008 adds recipe, nutrition, cook, and AI rate-limit tables', () => {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  apply(db, '0002_better_auth.sql')
  apply(db, '0003_profiles.sql')
  apply(db, '0004_households.sql')
  apply(db, '0005_inventory_mvp.sql')
  apply(db, '0006_open_facts.sql')
  apply(db, '0007_shopping.sql')
  apply(db, '0008_ai_cook.sql')

  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
    .all() as Array<{ name: string }>
  expect(tables.map((row) => row.name)).toEqual(
    expect.arrayContaining(['recipes', 'recipe_ingredients', 'recipe_nutrition', 'recipe_cooks', 'ai_rate_limits']),
  )

  seedHousehold(db)
  db.exec(
    `INSERT INTO products (id, household_id, barcode, name, normalized_name, brand, default_unit, source, created_at, updated_at)
     VALUES ('p1', 'h1', NULL, 'Ouă', 'oua', NULL, 'each', 'manual', datetime('now'), datetime('now'))`,
  )
  db.exec(
    `INSERT INTO recipes (
       id, household_id, created_by_user_id, title, description, servings, time_minutes,
       instructions_json, source, ai_model, created_at, updated_at
     ) VALUES (
       'r1', 'h1', 'user-1', 'Omletă', NULL, 2, 10, '["Bate ouăle"]', 'ai',
       '@cf/meta/llama-4-scout-17b-16e-instruct', datetime('now'), datetime('now')
     )`,
  )
  db.exec(
    `INSERT INTO recipe_ingredients (recipe_id, position, product_id, product_name, quantity, unit)
     VALUES ('r1', 0, 'p1', 'Ouă', 4, 'each')`,
  )
  db.exec(
    `INSERT INTO recipe_nutrition (
       recipe_id, energy_kcal_total, protein_g_total, carbohydrates_g_total, fat_g_total,
       energy_kcal_per_serving, protein_g_per_serving, carbohydrates_g_per_serving, fat_g_per_serving,
       calculable_ingredients, total_ingredients, is_complete, calculated_at
     ) VALUES ('r1', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, 1, 0, datetime('now'))`,
  )
  db.exec(
    `INSERT INTO recipe_cooks (id, recipe_id, household_id, user_id, created_at)
     VALUES ('c1', 'r1', 'h1', 'user-1', datetime('now'))`,
  )
  db.exec(
    `INSERT INTO ai_rate_limits (user_id, window_start, count)
     VALUES ('user-1', '2026-09-06T14:00:00.000Z', 1)`,
  )

  expect(() =>
    db.exec(
      `INSERT INTO recipes (
         id, household_id, created_by_user_id, title, description, servings, time_minutes,
         instructions_json, source, ai_model, created_at, updated_at
       ) VALUES (
         'r2', 'h1', 'user-1', 'Bad', NULL, 0, NULL, '[]', 'ai', NULL, datetime('now'), datetime('now')
       )`,
    ),
  ).toThrow(/CHECK/)

  expect(() =>
    db.exec(
      `INSERT INTO recipes (
         id, household_id, created_by_user_id, title, description, servings, time_minutes,
         instructions_json, source, ai_model, created_at, updated_at
       ) VALUES (
         'r3', 'h1', 'user-1', 'Manual', NULL, 1, NULL, '[]', 'manual', NULL, datetime('now'), datetime('now')
       )`,
    ),
  ).toThrow(/CHECK/)

  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})
