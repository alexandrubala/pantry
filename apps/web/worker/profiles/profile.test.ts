import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, test } from 'vitest'
import { ensureProfile } from './profile'

function migrationsDir() {
  return join(process.cwd(), '../../packages/database/migrations')
}

function sqliteAsD1(db: DatabaseSync): D1Database {
  return {
    prepare(query: string) {
      let params: unknown[] = []
      const statement = {
        bind(...values: unknown[]) {
          params = values
          return statement
        },
        async first() {
          const row = db.prepare(query).get(...params)
          return row ?? null
        },
        async run() {
          db.prepare(query).run(...params)
          return { success: true }
        },
        async all() {
          return { results: db.prepare(query).all(...params) }
        },
      }
      return statement
    },
  } as D1Database
}

function openPantryDb() {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(readFileSync(join(migrationsDir(), '0002_better_auth.sql'), 'utf8'))
  db.exec(readFileSync(join(migrationsDir(), '0003_profiles.sql'), 'utf8'))
  return db
}

function insertUser(db: DatabaseSync, id: string, name: string, email: string) {
  db.prepare(
    `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
     VALUES (?, ?, ?, 0, datetime('now'), datetime('now'))`,
  ).run(id, name, email)
}

test('ensureProfile creates a profile from the Better Auth user name with locale ro', async () => {
  const sqlite = openPantryDb()
  insertUser(sqlite, 'user-1', 'Pantry Test', 'one@example.invalid')

  const profile = await ensureProfile(sqliteAsD1(sqlite), {
    id: 'user-1',
    name: 'Pantry Test',
  })

  expect(profile).toEqual({
    id: 'user-1',
    displayName: 'Pantry Test',
    avatarUrl: null,
    locale: 'ro',
  })

  const count = sqlite.prepare('SELECT COUNT(*) AS n FROM profiles').get() as { n: number }
  expect(count.n).toBe(1)
})

test('ensureProfile is idempotent and keeps a single row', async () => {
  const sqlite = openPantryDb()
  insertUser(sqlite, 'user-1', 'Pantry Test', 'one@example.invalid')
  const d1 = sqliteAsD1(sqlite)

  await ensureProfile(d1, { id: 'user-1', name: 'Pantry Test' })
  await ensureProfile(d1, { id: 'user-1', name: 'Other Name' })

  const rows = sqlite.prepare('SELECT id, display_name, locale FROM profiles').all() as Array<{
    id: string
    display_name: string
    locale: string
  }>
  expect(rows).toEqual([{ id: 'user-1', display_name: 'Pantry Test', locale: 'ro' }])
})

test('deleting a Better Auth user cascades profile deletion', () => {
  const sqlite = openPantryDb()
  insertUser(sqlite, 'user-1', 'Pantry Test', 'one@example.invalid')
  sqlite
    .prepare(
      `INSERT INTO profiles (id, display_name, locale, created_at, updated_at)
       VALUES (?, 'Pantry Test', 'ro', datetime('now'), datetime('now'))`,
    )
    .run('user-1')

  sqlite.prepare(`DELETE FROM "user" WHERE id = ?`).run('user-1')

  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM "user"').get()).toEqual({ n: 0 })
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM profiles').get()).toEqual({ n: 0 })
})
