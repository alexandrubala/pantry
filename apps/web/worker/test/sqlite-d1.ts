import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { memoryR2, type MemoryR2 } from './memory-r2'

const TEST_SECRET = 'test-secret-at-least-32-characters-long'
const TEST_URL = 'http://localhost:5173'
const writeQueues = new WeakMap<object, Promise<void>>()

function enqueueWrite<T>(db: object, work: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(db) ?? Promise.resolve()
  const current = previous.then(work, work)
  writeQueues.set(
    db,
    current.then(
      () => undefined,
      () => undefined,
    ),
  )
  return current
}

export function migrationsDir() {
  return join(process.cwd(), '../../packages/database/migrations')
}

export function sqliteAsD1(db: DatabaseSync): D1Database {
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
    async batch(statements: Array<{ run: () => Promise<unknown> }>) {
      return enqueueWrite(db, async () => {
        db.exec('BEGIN')
        try {
          const results = []
          for (const statement of statements) {
            results.push(await statement.run())
          }
          db.exec('COMMIT')
          return results
        } catch (error) {
          db.exec('ROLLBACK')
          throw error
        }
      })
    },
  } as D1Database
}

export function openPantryDb() {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(readFileSync(join(migrationsDir(), '0002_better_auth.sql'), 'utf8'))
  db.exec(readFileSync(join(migrationsDir(), '0003_profiles.sql'), 'utf8'))
  db.exec(readFileSync(join(migrationsDir(), '0004_households.sql'), 'utf8'))
  db.exec(readFileSync(join(migrationsDir(), '0005_inventory_mvp.sql'), 'utf8'))
  db.exec(readFileSync(join(migrationsDir(), '0006_open_facts.sql'), 'utf8'))
  db.exec(readFileSync(join(migrationsDir(), '0007_shopping.sql'), 'utf8'))
  db.exec(readFileSync(join(migrationsDir(), '0008_ai_cook.sql'), 'utf8'))
  db.exec(readFileSync(join(migrationsDir(), '0009_product_polish.sql'), 'utf8'))
  db.exec(readFileSync(join(migrationsDir(), '0010_household_sharing.sql'), 'utf8'))
  db.exec(readFileSync(join(migrationsDir(), '0011_settings_receipts.sql'), 'utf8'))
  db.exec(readFileSync(join(migrationsDir(), '0012_inventory_lot_edit.sql'), 'utf8'))
  db.exec(readFileSync(join(migrationsDir(), '0013_household_product_images.sql'), 'utf8'))
  return db
}

export function insertUser(db: DatabaseSync, id: string, name: string, email: string) {
  db.prepare(
    `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
     VALUES (?, ?, ?, 0, datetime('now'), datetime('now'))`,
  ).run(id, name, email)
}

export function insertProfile(db: DatabaseSync, id: string, displayName: string) {
  db.prepare(
    `INSERT INTO profiles (id, display_name, locale, created_at, updated_at)
     VALUES (?, ?, 'ro', datetime('now'), datetime('now'))`,
  ).run(id, displayName)
}

export function envWithDb(
  db: DatabaseSync,
  aiRun?: (model: string, inputs: unknown, options?: unknown) => Promise<unknown>,
  r2: MemoryR2 = memoryR2(),
) {
  return {
    DB: sqliteAsD1(db),
    BETTER_AUTH_SECRET: TEST_SECRET,
    BETTER_AUTH_URL: TEST_URL,
    AI_MODEL: '@cf/meta/llama-4-scout-17b-16e-instruct',
    RECEIPT_AI_MODEL: '@cf/google/gemma-4-26b-a4b-it',
    R2: r2,
    AI: {
      async run(model: string, inputs: unknown, options?: unknown) {
        if (!aiRun) {
          throw new Error('AI binding not stubbed')
        }
        return aiRun(model, inputs, options)
      },
    },
  }
}
