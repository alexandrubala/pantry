import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { expect, test } from 'vitest'

const migrations = join(dirname(fileURLToPath(import.meta.url)), '../migrations')

function apply(db: DatabaseSync, file: string) {
  db.exec(readFileSync(join(migrations, file), 'utf8'))
}

function applyThrough0010(db: DatabaseSync) {
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
}

test('0011 creates receipt rate limits without receipt image or archive tables', () => {
  const db = new DatabaseSync(':memory:')
  applyThrough0010(db)
  apply(db, '0011_settings_receipts.sql')

  db.exec(
    `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
     VALUES ('user-1', 'Alex', 'alex@example.invalid', 0, datetime('now'), datetime('now'))`,
  )
  db.exec(
    `INSERT INTO receipt_ai_rate_limits (user_id, window_start, count)
     VALUES ('user-1', '2026-09-06T10:00:00.000Z', 1)`,
  )

  expect(db.prepare('SELECT COUNT(*) AS n FROM receipt_ai_rate_limits').get()).toEqual({ n: 1 })

  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
    .all() as Array<{ name: string }>
  expect(tables.map((row) => row.name)).not.toContain('receipts')
  expect(tables.map((row) => row.name)).not.toContain('receipt_images')

  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})
