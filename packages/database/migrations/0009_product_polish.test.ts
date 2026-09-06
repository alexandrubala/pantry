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
  db.exec(
    `INSERT INTO locations (id, household_id, name, normalized_name, sort_order, is_active, created_at, updated_at)
     VALUES ('loc-1', 'h1', 'Frigider', 'frigider', 0, 1, datetime('now'), datetime('now'))`,
  )
  db.exec(
    `INSERT INTO products (id, household_id, barcode, name, normalized_name, brand, default_unit, source, created_at, updated_at)
     VALUES ('p1', 'h1', NULL, 'Lapte', 'lapte', NULL, 'ml', 'manual', datetime('now'), datetime('now'))`,
  )
}

test('0009 copies existing history, allows move, and keeps foreign keys valid', () => {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  apply(db, '0002_better_auth.sql')
  apply(db, '0003_profiles.sql')
  apply(db, '0004_households.sql')
  apply(db, '0005_inventory_mvp.sql')
  apply(db, '0006_open_facts.sql')
  apply(db, '0007_shopping.sql')
  apply(db, '0008_ai_cook.sql')

  seedHousehold(db)
  db.exec(
    `INSERT INTO inventory_history (
       id, household_id, product_id, location_id, user_id, action, delta_quantity, unit, expires_on, created_at
     ) VALUES (
       'h-add', 'h1', 'p1', 'loc-1', 'user-1', 'add', 1000, 'ml', '2026-09-12', datetime('now')
     )`,
  )

  apply(db, '0009_product_polish.sql')

  expect(db.prepare('SELECT COUNT(*) AS n FROM inventory_history').get()).toEqual({ n: 1 })
  expect(db.prepare('SELECT action FROM inventory_history WHERE id = ?').get('h-add')).toEqual({
    action: 'add',
  })

  db.exec(
    `INSERT INTO inventory_history (
       id, household_id, product_id, location_id, user_id, action, delta_quantity, unit, expires_on, created_at
     ) VALUES (
       'h-move', 'h1', 'p1', 'loc-1', 'user-1', 'move', 700, 'ml', NULL, datetime('now')
     )`,
  )
  expect(db.prepare('SELECT COUNT(*) AS n FROM inventory_history WHERE action = ?').get('move')).toEqual({
    n: 1,
  })

  expect(() =>
    db.exec(
      `INSERT INTO inventory_history (
         id, household_id, product_id, location_id, user_id, action, delta_quantity, unit, expires_on, created_at
       ) VALUES (
         'h-bad', 'h1', 'p1', 'loc-1', 'user-1', 'transfer', 1, 'ml', NULL, datetime('now')
       )`,
    ),
  ).toThrow()

  const indexes = db.prepare(`PRAGMA index_list(inventory_lots)`).all() as Array<{ name: string }>
  expect(indexes.map((index) => index.name)).toEqual(
    expect.arrayContaining(['inventory_lots_household_expires_idx']),
  )
  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})
