import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { expect, test } from 'vitest'

const migrations = join(dirname(fileURLToPath(import.meta.url)), '../migrations')

function apply(db: DatabaseSync, file: string) {
  db.exec(readFileSync(join(migrations, file), 'utf8'))
}

test('0004 adds household tables and profiles.active_household_id without rebuilding profiles', () => {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  apply(db, '0002_better_auth.sql')
  apply(db, '0003_profiles.sql')

  const before = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'profiles'`)
    .get() as { sql: string }
  expect(before.sql).not.toMatch(/active_household_id/)

  apply(db, '0004_households.sql')

  const columns = db.prepare('PRAGMA table_info(profiles)').all() as Array<{ name: string }>
  expect(columns.some((column) => column.name === 'active_household_id')).toBe(true)

  const profileFks = db.prepare('PRAGMA foreign_key_list(profiles)').all() as Array<{
    table: string
    from: string
    to: string
    on_delete: string
  }>
  expect(profileFks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        table: 'households',
        from: 'active_household_id',
        to: 'id',
        on_delete: 'SET NULL',
      }),
    ]),
  )

  const indexes = db.prepare(`PRAGMA index_list(locations)`).all() as Array<{ name: string; unique: number }>
  expect(
    indexes.some(
      (index) => index.name === 'locations_household_active_normalized_name_idx' && index.unique === 1,
    ),
  ).toBe(true)

  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})
