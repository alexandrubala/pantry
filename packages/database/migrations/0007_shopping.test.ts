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

test('0007 adds shopping tables, one active list per household, and unchecked product uniqueness', () => {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  apply(db, '0002_better_auth.sql')
  apply(db, '0003_profiles.sql')
  apply(db, '0004_households.sql')
  apply(db, '0005_inventory_mvp.sql')
  apply(db, '0006_open_facts.sql')
  apply(db, '0007_shopping.sql')

  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
    .all() as Array<{ name: string }>
  expect(tables.map((row) => row.name)).toEqual(expect.arrayContaining(['shopping_lists', 'shopping_items']))

  const listIndexes = db.prepare(`PRAGMA index_list(shopping_lists)`).all() as Array<{
    name: string
    unique: number
  }>
  expect(
    listIndexes.some((index) => index.name === 'shopping_lists_household_active_idx' && index.unique === 1),
  ).toBe(true)

  const itemIndexes = db.prepare(`PRAGMA index_list(shopping_items)`).all() as Array<{
    name: string
    unique: number
  }>
  expect(
    itemIndexes.some(
      (index) => index.name === 'shopping_items_list_unchecked_product_idx' && index.unique === 1,
    ),
  ).toBe(true)

  seedHousehold(db)

  db.exec(
    `INSERT INTO shopping_lists (id, household_id, status, created_at, updated_at)
     VALUES ('list-1', 'h1', 'active', datetime('now'), datetime('now'))`,
  )
  expect(() =>
    db.exec(
      `INSERT INTO shopping_lists (id, household_id, status, created_at, updated_at)
       VALUES ('list-2', 'h1', 'active', datetime('now'), datetime('now'))`,
    ),
  ).toThrow(/UNIQUE/)

  db.exec(
    `INSERT INTO products (id, household_id, barcode, name, normalized_name, brand, default_unit, source, created_at, updated_at)
     VALUES ('p1', 'h1', NULL, 'Lapte', 'lapte', NULL, 'package', 'manual', datetime('now'), datetime('now'))`,
  )
  db.exec(
    `INSERT INTO shopping_items (
       id, shopping_list_id, household_id, product_id, name, normalized_name, quantity, unit,
       is_checked, checked_at, created_by_user_id, created_at, updated_at
     ) VALUES ('i1', 'list-1', 'h1', 'p1', 'Lapte', 'lapte', 1, 'package', 0, NULL, 'user-1', datetime('now'), datetime('now'))`,
  )
  expect(() =>
    db.exec(
      `INSERT INTO shopping_items (
         id, shopping_list_id, household_id, product_id, name, normalized_name, quantity, unit,
         is_checked, checked_at, created_by_user_id, created_at, updated_at
       ) VALUES ('i2', 'list-1', 'h1', 'p1', 'Lapte', 'lapte', 1, 'package', 0, NULL, 'user-1', datetime('now'), datetime('now'))`,
    ),
  ).toThrow(/UNIQUE/)

  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})
