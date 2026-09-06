import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { expect, test } from 'vitest'

const migrations = join(dirname(fileURLToPath(import.meta.url)), '../migrations')

function apply(db: DatabaseSync, file: string) {
  db.exec(readFileSync(join(migrations, file), 'utf8'))
}

function applyThrough0009(db: DatabaseSync) {
  db.exec('PRAGMA foreign_keys = ON')
  apply(db, '0002_better_auth.sql')
  apply(db, '0003_profiles.sql')
  apply(db, '0004_households.sql')
  apply(db, '0005_inventory_mvp.sql')
  apply(db, '0006_open_facts.sql')
  apply(db, '0007_shopping.sql')
  apply(db, '0008_ai_cook.sql')
  apply(db, '0009_product_polish.sql')
}

function seedHousehold(db: DatabaseSync) {
  db.exec(
    `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
     VALUES
       ('user-1', 'Alex', 'alex@example.invalid', 0, datetime('now'), datetime('now')),
       ('user-2', 'Maria', 'maria@example.invalid', 0, datetime('now'), datetime('now'))`,
  )
  db.exec(
    `INSERT INTO households (id, name, created_at, updated_at)
     VALUES ('h1', 'Casa mea', datetime('now'), datetime('now'))`,
  )
  db.exec(
    `INSERT INTO household_members (household_id, user_id, role, created_at)
     VALUES ('h1', 'user-1', 'owner', datetime('now'))`,
  )
}

test('0010 creates hashed invites, rejects owner role, and keeps foreign keys valid', () => {
  const db = new DatabaseSync(':memory:')
  applyThrough0009(db)
  seedHousehold(db)
  apply(db, '0010_household_sharing.sql')

  db.exec(
    `INSERT INTO invites (
       id, household_id, token_hash, role, expires_at, accepted_at, revoked_at,
       accepted_by_user_id, created_by_user_id, created_at
     ) VALUES (
       'inv-1', 'h1', 'abc123hash', 'member', datetime('now', '+7 days'), NULL, NULL,
       NULL, 'user-1', datetime('now')
     )`,
  )

  expect(db.prepare('SELECT COUNT(*) AS n FROM invites').get()).toEqual({ n: 1 })
  expect(db.prepare('SELECT token_hash, role FROM invites WHERE id = ?').get('inv-1')).toEqual({
    token_hash: 'abc123hash',
    role: 'member',
  })

  const columns = db.prepare(`PRAGMA table_info(invites)`).all() as Array<{ name: string }>
  expect(columns.map((column) => column.name)).not.toContain('token')

  expect(() =>
    db.exec(
      `INSERT INTO invites (
         id, household_id, token_hash, role, expires_at, created_by_user_id, created_at
       ) VALUES (
         'inv-bad-role', 'h1', 'otherhash', 'owner', datetime('now', '+7 days'), 'user-1', datetime('now')
       )`,
    ),
  ).toThrow()

  expect(() =>
    db.exec(
      `INSERT INTO invites (
         id, household_id, token_hash, role, expires_at, created_by_user_id, created_at
       ) VALUES (
         'inv-missing-house', 'missing', 'missinghash', 'member', datetime('now', '+7 days'), 'user-1', datetime('now')
       )`,
    ),
  ).toThrow()

  db.exec(
    `INSERT INTO invites (
       id, household_id, token_hash, role, expires_at, accepted_at, accepted_by_user_id,
       created_by_user_id, created_at
     ) VALUES (
       'inv-2', 'h1', 'acceptedhash', 'member', datetime('now', '+7 days'), datetime('now'), 'user-2',
       'user-1', datetime('now')
     )`,
  )

  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])

  db.exec(`DELETE FROM households WHERE id = 'h1'`)
  expect(db.prepare('SELECT COUNT(*) AS n FROM invites').get()).toEqual({ n: 0 })
  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})
