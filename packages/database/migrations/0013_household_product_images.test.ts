import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { expect, test } from 'vitest'

const migrations = join(dirname(fileURLToPath(import.meta.url)), '../migrations')

function apply(db: DatabaseSync, file: string) {
  db.exec(readFileSync(join(migrations, file), 'utf8'))
}

function applyThrough0012(db: DatabaseSync) {
  db.exec('PRAGMA foreign_keys = ON')
  apply(db, '0002_better_auth.sql')
  apply(db, '0003_profiles.sql')
  apply(db, '0004_households.sql')
  apply(db, '0005_inventory_mvp.sql')
  apply(db, '0006_open_facts.sql')
  apply(db, '0007_shopping.sql')
  apply(db, '0008_ai_cook.sql')
  apply(db, '0009_product_polish.sql')
  apply(db, '0010_household_sharing.sql')
  apply(db, '0011_settings_receipts.sql')
  apply(db, '0012_inventory_lot_edit.sql')
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
  db.exec(
    `INSERT INTO products (id, household_id, barcode, name, normalized_name, brand, default_unit, source, created_at, updated_at)
     VALUES ('p1', 'h1', NULL, 'Penne', 'penne', NULL, 'package', 'manual', datetime('now'), datetime('now'))`,
  )
}

test('0013 creates household_product_images with household/product uniqueness and FKs', () => {
  const db = new DatabaseSync(':memory:')
  applyThrough0012(db)
  seedHousehold(db)
  apply(db, '0013_household_product_images.sql')

  db.exec(
    `INSERT INTO household_product_images (
       household_id, product_id, r2_key, content_type, created_by_user_id, created_at, updated_at
     ) VALUES (
       'h1', 'p1', 'households/h1/products/p1/abc.webp', 'image/webp', 'user-1', datetime('now'), datetime('now')
     )`,
  )

  expect(
    db.prepare('SELECT r2_key, content_type FROM household_product_images WHERE household_id = ? AND product_id = ?').get(
      'h1',
      'p1',
    ),
  ).toEqual({
    r2_key: 'households/h1/products/p1/abc.webp',
    content_type: 'image/webp',
  })

  expect(() =>
    db.exec(
      `INSERT INTO household_product_images (
         household_id, product_id, r2_key, content_type, created_by_user_id, created_at, updated_at
       ) VALUES (
         'h1', 'p1', 'households/h1/products/p1/other.webp', 'image/jpeg', 'user-1', datetime('now'), datetime('now')
       )`,
    ),
  ).toThrow()

  expect(() =>
    db.exec(
      `INSERT INTO household_product_images (
         household_id, product_id, r2_key, content_type, created_by_user_id, created_at, updated_at
       ) VALUES (
         'h1', 'p1', 'households/h1/products/p1/bad.svg', 'image/svg+xml', 'user-1', datetime('now'), datetime('now')
       )`,
    ),
  ).toThrow()

  expect(() =>
    db.exec(
      `INSERT INTO household_product_images (
         household_id, product_id, r2_key, content_type, created_by_user_id, created_at, updated_at
       ) VALUES (
         'missing-h', 'p1', 'households/x/products/p1/a.webp', 'image/webp', 'user-1', datetime('now'), datetime('now')
       )`,
    ),
  ).toThrow()

  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})
