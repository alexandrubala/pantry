import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { expect, test } from 'vitest'

const migrations = join(dirname(fileURLToPath(import.meta.url)), '../migrations')

function apply(db: DatabaseSync, file: string) {
  db.exec(readFileSync(join(migrations, file), 'utf8'))
}

test('0005 adds inventory tables, barcode uniqueness, and the conflict abort guard', () => {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  apply(db, '0002_better_auth.sql')
  apply(db, '0003_profiles.sql')
  apply(db, '0004_households.sql')
  apply(db, '0005_inventory_mvp.sql')

  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
    .all() as Array<{ name: string }>
  expect(tables.map((row) => row.name)).toEqual(
    expect.arrayContaining([
      'products',
      'inventory_lots',
      'inventory_history',
      'inventory_settings',
      'inventory_conflict_abort',
    ]),
  )

  const lotIndexes = db.prepare(`PRAGMA index_list(inventory_lots)`).all() as Array<{
    name: string
    unique: number
  }>
  expect(
    lotIndexes.some(
      (index) =>
        index.name === 'inventory_lots_household_product_location_expires_idx' && index.unique === 1,
    ),
  ).toBe(true)

  const productIndexes = db.prepare(`PRAGMA index_list(products)`).all() as Array<{ name: string }>
  expect(productIndexes.map((index) => index.name)).toEqual(
    expect.arrayContaining(['products_global_barcode_idx', 'products_household_barcode_idx']),
  )

  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})
