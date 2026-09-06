import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import type { D1DatabaseLike, D1PreparedStatementLike } from './d1-like.js'

export function migrationsDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '../../migrations')
}

export function applyPantryMigrations(db: DatabaseSync): void {
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(readFileSync(join(migrationsDir(), '0002_better_auth.sql'), 'utf8'))
  db.exec(readFileSync(join(migrationsDir(), '0003_profiles.sql'), 'utf8'))
  db.exec(readFileSync(join(migrationsDir(), '0004_households.sql'), 'utf8'))
}

export function sqliteAsD1(db: DatabaseSync): D1DatabaseLike {
  return {
    prepare(query: string): D1PreparedStatementLike {
      let params: unknown[] = []
      const statement: D1PreparedStatementLike = {
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
    async batch(statements) {
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
    },
  }
}

export function insertUser(db: DatabaseSync, id: string, name: string, email: string): void {
  db.prepare(
    `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
     VALUES (?, ?, ?, 0, datetime('now'), datetime('now'))`,
  ).run(id, name, email)
}

export function insertProfile(db: DatabaseSync, id: string, displayName: string): void {
  db.prepare(
    `INSERT INTO profiles (id, display_name, locale, created_at, updated_at)
     VALUES (?, ?, 'ro', datetime('now'), datetime('now'))`,
  ).run(id, displayName)
}
