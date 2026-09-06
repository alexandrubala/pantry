import { beforeEach, expect, test, vi } from 'vitest'

vi.mock('../auth/session.js', () => ({
  resolveCurrentUser: vi.fn(),
}))

import { resolveCurrentUser } from '../auth/session.js'
import { app } from '../index'
import { envWithDb, insertProfile, insertUser, openPantryDb } from '../test/sqlite-d1'

const resolveCurrentUserMock = vi.mocked(resolveCurrentUser)

beforeEach(() => {
  resolveCurrentUserMock.mockReset()
  resolveCurrentUserMock.mockResolvedValue(null)
})

async function createHousehold(db: ReturnType<typeof openPantryDb>, userId: string, name: string) {
  resolveCurrentUserMock.mockResolvedValue({ id: userId, name: userId })
  const res = await app.request(
    '/api/v1/households',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    },
    envWithDb(db),
  )
  expect(res.status).toBe(201)
  return (await res.json()) as { household: { id: string; name: string } }
}

test('GET /api/v1/locations requires auth and an active household', async () => {
  const db = openPantryDb()
  const env = envWithDb(db)

  const unauthorized = await app.request('/api/v1/locations', {}, env)
  expect(unauthorized.status).toBe(401)

  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  resolveCurrentUserMock.mockResolvedValue({ id: 'user-1', name: 'Alex' })
  const setupRequired = await app.request('/api/v1/locations', {}, env)
  expect(setupRequired.status).toBe(409)
  await expect(setupRequired.json()).resolves.toEqual({
    error: 'Household setup required',
    code: 'HOUSEHOLD_REQUIRED',
  })
})

test('GET /api/v1/locations returns active household locations from D1', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')

  const res = await app.request('/api/v1/locations', {}, envWithDb(db))
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.locations).toHaveLength(7)
  expect(body.locations.map((location: { name: string }) => location.name)).toEqual([
    'Frigider',
    'Congelator',
    'Cămară',
    'Baie',
    'Garaj',
    'Curățenie',
    'Altele',
  ])
})

test('POST /api/v1/locations uses the active household and rejects duplicates', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')

  const created = await app.request(
    '/api/v1/locations',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Beci' }),
    },
    envWithDb(db),
  )
  expect(created.status).toBe(201)
  const createdBody = await created.json()
  expect(createdBody.location.name).toBe('Beci')

  const list = await app.request('/api/v1/locations', {}, envWithDb(db))
  const listBody = await list.json()
  expect(listBody.locations).toHaveLength(8)

  const duplicate = await app.request(
    '/api/v1/locations',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'beci' }),
    },
    envWithDb(db),
  )
  expect(duplicate.status).toBe(409)
  await expect(duplicate.json()).resolves.toEqual({
    error: 'Location name already exists',
    code: 'LOCATION_NAME_TAKEN',
  })
})

test('GET /api/v1/locations ignores a client-supplied householdId', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-a', 'A', 'a@example.invalid')
  insertUser(db, 'user-b', 'B', 'b@example.invalid')
  insertProfile(db, 'user-a', 'A')
  insertProfile(db, 'user-b', 'B')
  await createHousehold(db, 'user-a', 'Casa A')
  const householdB = await createHousehold(db, 'user-b', 'Casa B')

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-b', name: 'B' })
  await app.request(
    '/api/v1/locations',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Beci B' }),
    },
    envWithDb(db),
  )

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-a', name: 'A' })
  const res = await app.request(
    `/api/v1/locations?householdId=${householdB.household.id}`,
    {},
    envWithDb(db),
  )
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.locations).toHaveLength(7)
  expect(JSON.stringify(body)).not.toMatch(/Beci B/)
})

test('locations stay isolated across tenants', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-a', 'A', 'a@example.invalid')
  insertUser(db, 'user-b', 'B', 'b@example.invalid')
  insertProfile(db, 'user-a', 'A')
  insertProfile(db, 'user-b', 'B')
  await createHousehold(db, 'user-a', 'Casa A')
  await createHousehold(db, 'user-b', 'Casa B')

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-a', name: 'A' })
  await app.request(
    '/api/v1/locations',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Beci' }),
    },
    envWithDb(db),
  )

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-b', name: 'B' })
  const listB = await app.request('/api/v1/locations', {}, envWithDb(db))
  const bodyB = await listB.json()
  expect(bodyB.locations).toHaveLength(7)
  expect(JSON.stringify(bodyB)).not.toMatch(/Beci/)

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-a', name: 'A' })
  const listA = await app.request('/api/v1/locations', {}, envWithDb(db))
  expect((await listA.json()).locations).toHaveLength(8)
})
