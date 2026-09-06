import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { expect, test } from 'vitest'

const migrations = join(dirname(fileURLToPath(import.meta.url)), '../migrations')

function apply(db: DatabaseSync, file: string) {
  db.exec(readFileSync(join(migrations, file), 'utf8'))
}

test('0006 adds Open Facts metadata columns and product_nutrition without dropping inventory', () => {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  apply(db, '0002_better_auth.sql')
  apply(db, '0003_profiles.sql')
  apply(db, '0004_households.sql')
  apply(db, '0005_inventory_mvp.sql')

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
     VALUES ('p1', 'h1', NULL, 'Lapte', 'lapte', 'Pilos', 'ml', 'manual', datetime('now'), datetime('now'))`,
  )
  db.exec(
    `INSERT INTO inventory_lots (id, household_id, product_id, location_id, quantity, expires_on, expires_key, created_at, updated_at)
     VALUES ('lot-1', 'h1', 'p1', 'loc-1', 1000, NULL, '', datetime('now'), datetime('now'))`,
  )

  apply(db, '0006_open_facts.sql')

  const columns = db.prepare(`PRAGMA table_info(products)`).all() as Array<{ name: string }>
  expect(columns.map((column) => column.name)).toEqual(
    expect.arrayContaining([
      'image_url',
      'external_catalog',
      'external_product_type',
      'package_quantity',
      'package_unit',
      'external_fetched_at',
    ]),
  )

  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'product_nutrition'`)
    .get() as { name: string }
  expect(tables.name).toBe('product_nutrition')

  expect(db.prepare('SELECT COUNT(*) AS n FROM products').get()).toEqual({ n: 1 })
  expect(db.prepare('SELECT COUNT(*) AS n FROM inventory_lots').get()).toEqual({ n: 1 })
  expect(db.prepare('SELECT name FROM products WHERE id = ?').get('p1')).toEqual({ name: 'Lapte' })
  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})
