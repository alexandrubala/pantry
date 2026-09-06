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

test('household routes require a session', async () => {
  const db = openPantryDb()
  const env = envWithDb(db)

  const list = await app.request('/api/v1/households', {}, env)
  expect(list.status).toBe(401)

  const create = await app.request('/api/v1/households', { method: 'POST', body: '{"name":"Casa mea"}' }, env)
  expect(create.status).toBe(401)

  const active = await app.request('/api/v1/household', {}, env)
  expect(active.status).toBe(401)
})

test('POST /api/v1/households creates owner membership, defaults, and active household', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  resolveCurrentUserMock.mockResolvedValue({ id: 'user-1', name: 'Alex' })

  const created = await app.request(
    '/api/v1/households',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '  Casa mea  ' }),
    },
    envWithDb(db),
  )

  expect(created.status).toBe(201)
  const body = await created.json()
  expect(body.household.name).toBe('Casa mea')
  expect(body.household.role).toBe('owner')
  expect(typeof body.household.id).toBe('string')

  expect(db.prepare('SELECT COUNT(*) AS n FROM households').get()).toEqual({ n: 1 })
  expect(db.prepare('SELECT COUNT(*) AS n FROM household_members WHERE role = ?').get('owner')).toEqual({
    n: 1,
  })
  expect(db.prepare('SELECT COUNT(*) AS n FROM locations WHERE is_active = 1').get()).toEqual({ n: 7 })
  expect(db.prepare('SELECT active_household_id FROM profiles WHERE id = ?').get('user-1')).toEqual({
    active_household_id: body.household.id,
  })

  const first = await app.request('/api/v1/household', {}, envWithDb(db))
  const second = await app.request('/api/v1/household', {}, envWithDb(db))
  expect(first.status).toBe(200)
  expect(second.status).toBe(200)
  await expect(second.json()).resolves.toEqual(await first.json())
  expect(db.prepare('SELECT COUNT(*) AS n FROM households').get()).toEqual({ n: 1 })
})

test('GET /api/v1/households only returns memberships for the current user', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-a', 'A', 'a@example.invalid')
  insertUser(db, 'user-b', 'B', 'b@example.invalid')
  insertProfile(db, 'user-a', 'A')
  insertProfile(db, 'user-b', 'B')

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-a', name: 'A' })
  await app.request(
    '/api/v1/households',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Casa A' }),
    },
    envWithDb(db),
  )

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-b', name: 'B' })
  await app.request(
    '/api/v1/households',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Casa B' }),
    },
    envWithDb(db),
  )

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-a', name: 'A' })
  const res = await app.request('/api/v1/households', {}, envWithDb(db))
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.households).toHaveLength(1)
  expect(body.households[0].name).toBe('Casa A')
  expect(body.households[0].isActive).toBe(true)
  expect(JSON.stringify(body)).not.toMatch(/Casa B/)
})

test('PUT /api/v1/household/active switches between households the user belongs to', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-a', 'A', 'a@example.invalid')
  insertProfile(db, 'user-a', 'A')
  resolveCurrentUserMock.mockResolvedValue({ id: 'user-a', name: 'A' })

  const first = await app.request(
    '/api/v1/households',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Casa A' }),
    },
    envWithDb(db),
  )
  const second = await app.request(
    '/api/v1/households',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Casa A2' }),
    },
    envWithDb(db),
  )
  const householdA = (await first.json()).household.id as string
  const householdA2 = (await second.json()).household.id as string

  const switched = await app.request(
    '/api/v1/household/active',
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ householdId: householdA }),
    },
    envWithDb(db),
  )
  expect(switched.status).toBe(200)
  const body = await switched.json()
  expect(body.household).toEqual({ id: householdA, name: 'Casa A', role: 'owner' })
  expect(db.prepare('SELECT active_household_id FROM profiles WHERE id = ?').get('user-a')).toEqual({
    active_household_id: householdA,
  })

  const locations = await app.request('/api/v1/locations', {}, envWithDb(db))
  const locationsBody = await locations.json()
  expect(locationsBody.locations).toHaveLength(7)
  expect(householdA2).not.toBe(householdA)
})

test('PUT /api/v1/household/active rejects a household the user does not belong to', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-a', 'A', 'a@example.invalid')
  insertUser(db, 'user-b', 'B', 'b@example.invalid')
  insertProfile(db, 'user-a', 'A')
  insertProfile(db, 'user-b', 'B')

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-b', name: 'B' })
  const createdB = await app.request(
    '/api/v1/households',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Casa B' }),
    },
    envWithDb(db),
  )
  const householdB = (await createdB.json()).household.id as string

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-a', name: 'A' })
  await app.request(
    '/api/v1/households',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Casa A' }),
    },
    envWithDb(db),
  )

  const switched = await app.request(
    '/api/v1/household/active',
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ householdId: householdB }),
    },
    envWithDb(db),
  )

  expect(switched.status).toBe(404)
  const body = await switched.json()
  expect(body).toEqual({ error: 'Not found', code: 'NOT_FOUND' })
  expect(JSON.stringify(body)).not.toMatch(/Casa B/)
})

test('GET /api/v1/household repairs a stale active household without exposing another tenant', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-a', 'A', 'a@example.invalid')
  insertUser(db, 'user-b', 'B', 'b@example.invalid')
  insertProfile(db, 'user-a', 'A')
  insertProfile(db, 'user-b', 'B')

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-b', name: 'B' })
  const createdB = await app.request(
    '/api/v1/households',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Casa B' }),
    },
    envWithDb(db),
  )
  const householdB = (await createdB.json()).household.id as string

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-a', name: 'A' })
  await app.request(
    '/api/v1/households',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Casa A' }),
    },
    envWithDb(db),
  )

  db.prepare(`UPDATE profiles SET active_household_id = ? WHERE id = 'user-a'`).run(householdB)

  const repaired = await app.request('/api/v1/household', {}, envWithDb(db))
  expect(repaired.status).toBe(200)
  const body = await repaired.json()
  expect(body.household.name).toBe('Casa A')
  expect(body.household.id).not.toBe(householdB)
  expect(
    db.prepare('SELECT active_household_id FROM profiles WHERE id = ?').get('user-a'),
  ).toEqual({ active_household_id: body.household.id })
})

test('GET /api/v1/household returns null when the user has no household', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  resolveCurrentUserMock.mockResolvedValue({ id: 'user-1', name: 'Alex' })

  const res = await app.request('/api/v1/household', {}, envWithDb(db))
  expect(res.status).toBe(200)
  await expect(res.json()).resolves.toEqual({ household: null })
})
