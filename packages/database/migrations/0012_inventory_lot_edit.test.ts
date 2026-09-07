import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { expect, test } from 'vitest'

const migrations = join(dirname(fileURLToPath(import.meta.url)), '../migrations')

function apply(db: DatabaseSync, file: string) {
  db.exec(readFileSync(join(migrations, file), 'utf8'))
}

function applyThrough0011(db: DatabaseSync) {
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
     VALUES ('p1', 'h1', NULL, 'Penne', 'penne', NULL, 'package', 'manual', datetime('now'), datetime('now'))`,
  )
}

test('0012 copies existing history, allows edit with metadata, and keeps foreign keys valid', () => {
  const db = new DatabaseSync(':memory:')
  applyThrough0011(db)
  seedHousehold(db)
  db.exec(
    `INSERT INTO inventory_history (
       id, household_id, product_id, location_id, user_id, action, delta_quantity, unit, expires_on, created_at
     ) VALUES
       ('h-add', 'h1', 'p1', 'loc-1', 'user-1', 'add', 2, 'package', '2026-11-15', datetime('now')),
       ('h-move', 'h1', 'p1', 'loc-1', 'user-1', 'move', 2, 'package', '2026-11-15', datetime('now'))`,
  )

  apply(db, '0012_inventory_lot_edit.sql')

  expect(db.prepare('SELECT COUNT(*) AS n FROM inventory_history').get()).toEqual({ n: 2 })
  expect(db.prepare('SELECT action, metadata FROM inventory_history WHERE id = ?').get('h-add')).toEqual({
    action: 'add',
    metadata: null,
  })
  expect(db.prepare('SELECT action FROM inventory_history WHERE id = ?').get('h-move')).toEqual({
    action: 'move',
  })

  db.exec(
    `INSERT INTO inventory_history (
       id, household_id, product_id, location_id, user_id, action, delta_quantity, unit, expires_on, metadata, created_at
     ) VALUES (
       'h-edit', 'h1', 'p1', 'loc-1', 'user-1', 'edit', 0, 'package', '2027-01-20',
       '{"oldLocationId":"loc-1","newLocationId":"loc-1","oldExpiresOn":"2026-11-15","newExpiresOn":"2027-01-20"}',
       datetime('now')
     )`,
  )
  expect(db.prepare('SELECT COUNT(*) AS n FROM inventory_history WHERE action = ?').get('edit')).toEqual({
    n: 1,
  })

  expect(() =>
    db.exec(
      `INSERT INTO inventory_history (
         id, household_id, product_id, location_id, user_id, action, delta_quantity, unit, expires_on, created_at
       ) VALUES (
         'h-zero-add', 'h1', 'p1', 'loc-1', 'user-1', 'add', 0, 'package', NULL, datetime('now')
       )`,
    ),
  ).toThrow()

  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})
