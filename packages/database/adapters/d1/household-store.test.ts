import { DatabaseSync } from 'node:sqlite'
import { expect, test } from 'vitest'
import { DomainError } from '@pantry/core'
import { createD1HouseholdStore } from './household-store.js'
import { applyPantryMigrations, insertProfile, insertUser, sqliteAsD1 } from './sqlite-as-d1.js'

function openStore() {
  const sqlite = new DatabaseSync(':memory:')
  applyPantryMigrations(sqlite)
  return { sqlite, store: createD1HouseholdStore(sqliteAsD1(sqlite)) }
}

function seedUser(sqlite: DatabaseSync, id: string, email: string) {
  insertUser(sqlite, id, id, email)
  insertProfile(sqlite, id, id)
}

test('createHouseholdWithOwnerAndLocations writes household, owner, defaults, and active id atomically', async () => {
  const { sqlite, store } = openStore()
  seedUser(sqlite, 'user-1', 'alex@example.invalid')

  const created = await store.createHouseholdWithOwnerAndLocations({
    userId: 'user-1',
    name: 'Casa mea',
    ownerDisplayName: 'Alex',
  })

  expect(created.household.role).toBe('owner')
  expect(created.household.name).toBe('Casa mea')
  expect(created.locations).toHaveLength(7)
  expect(created.locations.map((location) => location.name)).toEqual([
    'Frigider',
    'Congelator',
    'Cămară',
    'Baie',
    'Garaj',
    'Curățenie',
    'Altele',
  ])

  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM households').get()).toEqual({ n: 1 })
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM household_members').get()).toEqual({ n: 1 })
  expect(sqlite.prepare('SELECT role FROM household_members').get()).toEqual({ role: 'owner' })
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM locations WHERE is_active = 1').get()).toEqual({
    n: 7,
  })
  expect(
    sqlite.prepare('SELECT active_household_id FROM profiles WHERE id = ?').get('user-1'),
  ).toEqual({ active_household_id: created.household.id })

  const again = await store.getActiveHousehold('user-1')
  expect(again).toEqual(created.household)
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM households').get()).toEqual({ n: 1 })
})

test('createHousehold rolls back when the user does not exist', async () => {
  const { sqlite, store } = openStore()

  await expect(
    store.createHouseholdWithOwnerAndLocations({
      userId: 'missing',
      name: 'Casa mea',
      ownerDisplayName: 'Ghost',
    }),
  ).rejects.toThrow()

  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM households').get()).toEqual({ n: 0 })
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM household_members').get()).toEqual({ n: 0 })
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM locations').get()).toEqual({ n: 0 })
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM profiles').get()).toEqual({ n: 0 })
})

test('repeated reads do not mutate household or location rows', async () => {
  const { sqlite, store } = openStore()
  seedUser(sqlite, 'user-1', 'alex@example.invalid')
  const created = await store.createHouseholdWithOwnerAndLocations({
    userId: 'user-1',
    name: 'Casa mea',
    ownerDisplayName: 'Alex',
  })

  const before = sqlite.prepare('SELECT updated_at FROM households WHERE id = ?').get(created.household.id)
  await store.getActiveHousehold('user-1')
  await store.listForUser('user-1')
  await store.listActiveLocations(created.household.id)
  const after = sqlite.prepare('SELECT updated_at FROM households WHERE id = ?').get(created.household.id)

  expect(after).toEqual(before)
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM locations').get()).toEqual({ n: 7 })
})

test('setActiveHousehold requires membership', async () => {
  const { sqlite, store } = openStore()
  seedUser(sqlite, 'user-a', 'a@example.invalid')
  seedUser(sqlite, 'user-b', 'b@example.invalid')

  const householdA = await store.createHouseholdWithOwnerAndLocations({
    userId: 'user-a',
    name: 'Casa A',
    ownerDisplayName: 'A',
  })
  const householdB = await store.createHouseholdWithOwnerAndLocations({
    userId: 'user-b',
    name: 'Casa B',
    ownerDisplayName: 'B',
  })

  await expect(store.setActiveHousehold('user-a', householdB.household.id)).rejects.toMatchObject({
    code: 'NOT_FOUND',
  })
  expect(
    sqlite.prepare('SELECT active_household_id FROM profiles WHERE id = ?').get('user-a'),
  ).toEqual({ active_household_id: householdA.household.id })
})

test('locations are scoped to the household and duplicate active names are rejected', async () => {
  const { sqlite, store } = openStore()
  seedUser(sqlite, 'user-a', 'a@example.invalid')
  seedUser(sqlite, 'user-b', 'b@example.invalid')

  const householdA = await store.createHouseholdWithOwnerAndLocations({
    userId: 'user-a',
    name: 'Casa A',
    ownerDisplayName: 'A',
  })
  const householdB = await store.createHouseholdWithOwnerAndLocations({
    userId: 'user-b',
    name: 'Casa B',
    ownerDisplayName: 'B',
  })

  const custom = await store.createLocation({ householdId: householdA.household.id, name: 'Beci' })
  expect(custom.name).toBe('Beci')
  expect(custom.sortOrder).toBe(80)

  const locationsA = await store.listActiveLocations(householdA.household.id)
  const locationsB = await store.listActiveLocations(householdB.household.id)
  expect(locationsA).toHaveLength(8)
  expect(locationsB).toHaveLength(7)
  expect(locationsA.some((location) => location.name === 'Beci')).toBe(true)
  expect(locationsB.some((location) => location.name === 'Beci')).toBe(false)

  try {
    await store.createLocation({ householdId: householdA.household.id, name: '  beci  ' })
    throw new Error('expected duplicate location to fail')
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError)
    expect((error as DomainError).code).toBe('LOCATION_NAME_TAKEN')
  }
})

test('deleting a user cascades membership but not the household', () => {
  const { sqlite } = openStore()
  seedUser(sqlite, 'user-1', 'alex@example.invalid')
  sqlite
    .prepare(
      `INSERT INTO households (id, name, created_at, updated_at)
       VALUES ('h1', 'Casa mea', datetime('now'), datetime('now'))`,
    )
    .run()
  sqlite
    .prepare(
      `INSERT INTO household_members (household_id, user_id, role, created_at)
       VALUES ('h1', 'user-1', 'owner', datetime('now'))`,
    )
    .run()
  sqlite.prepare(`UPDATE profiles SET active_household_id = 'h1' WHERE id = 'user-1'`).run()

  sqlite.prepare(`DELETE FROM "user" WHERE id = ?`).run('user-1')

  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM profiles').get()).toEqual({ n: 0 })
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM household_members').get()).toEqual({ n: 0 })
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM households').get()).toEqual({ n: 1 })
  expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})
