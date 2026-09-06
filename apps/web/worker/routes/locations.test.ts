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

test('location mutation routes require auth', async () => {
  const env = envWithDb(openPantryDb())
  expect(
    (
      await app.request(
        '/api/v1/locations/loc-1',
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Debara' }),
        },
        env,
      )
    ).status,
  ).toBe(401)
  expect((await app.request('/api/v1/locations/loc-1', { method: 'DELETE' }, env)).status).toBe(401)
})

test('PATCH /api/v1/locations/:id renames in the active household and rejects duplicates', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')

  const list = await app.request('/api/v1/locations', {}, envWithDb(db))
  const locations = ((await list.json()) as { locations: Array<{ id: string; name: string }> }).locations
  const pantry = locations.find((location) => location.name === 'Cămară')
  if (!pantry) {
    throw new Error('missing Cămară')
  }

  const renamed = await app.request(
    `/api/v1/locations/${pantry.id}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Debara' }),
    },
    envWithDb(db),
  )
  expect(renamed.status).toBe(200)
  expect(((await renamed.json()) as { location: { id: string; name: string } }).location).toMatchObject({
    id: pantry.id,
    name: 'Debara',
  })

  const duplicate = await app.request(
    `/api/v1/locations/${pantry.id}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Frigider' }),
    },
    envWithDb(db),
  )
  expect(duplicate.status).toBe(409)
})

test('renaming a location keeps inventory lots attached to the same id', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')
  const env = envWithDb(db)
  const list = await app.request('/api/v1/locations', {}, env)
  const pantry = ((await list.json()) as { locations: Array<{ id: string; name: string }> }).locations.find(
    (location) => location.name === 'Cămară',
  )
  if (!pantry) {
    throw new Error('missing Cămară')
  }
  const product = await app.request(
    '/api/v1/products',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Făină', unit: 'g' }),
    },
    env,
  )
  const productId = ((await product.json()) as { product: { id: string } }).product.id
  await app.request(
    '/api/v1/inventory/stock',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId, locationId: pantry.id, quantity: 1000, expiresOn: null }),
    },
    env,
  )
  const renamed = await app.request(
    `/api/v1/locations/${pantry.id}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Debara' }),
    },
    env,
  )
  expect(renamed.status).toBe(200)
  const inventory = await app.request('/api/v1/inventory', {}, env)
  const items = ((await inventory.json()) as { items: Array<{ lots: Array<{ locationId: string; locationName: string }> }> }).items
  expect(items[0]?.lots[0]?.locationId).toBe(pantry.id)
  expect(items[0]?.lots[0]?.locationName).toBe('Debara')
})

test('DELETE /api/v1/locations/:id deactivates empty locations and rejects stock or last location', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')
  const env = envWithDb(db)

  const created = await app.request(
    '/api/v1/locations',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Beci' }),
    },
    env,
  )
  const extraId = ((await created.json()) as { location: { id: string } }).location.id

  const list = await app.request('/api/v1/locations', {}, env)
  const locations = ((await list.json()) as { locations: Array<{ id: string; name: string }> }).locations
  const fridge = locations.find((location) => location.name === 'Frigider')
  if (!fridge) {
    throw new Error('missing Frigider')
  }

  const product = await app.request(
    '/api/v1/products',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Lapte', unit: 'ml' }),
    },
    env,
  )
  const productId = ((await product.json()) as { product: { id: string } }).product.id
  await app.request(
    '/api/v1/inventory/stock',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId, locationId: fridge.id, quantity: 1000, expiresOn: null }),
    },
    env,
  )

  const notEmpty = await app.request(`/api/v1/locations/${fridge.id}`, { method: 'DELETE' }, env)
  expect(notEmpty.status).toBe(409)
  await expect(notEmpty.json()).resolves.toMatchObject({ code: 'LOCATION_NOT_EMPTY' })

  const consumed = await app.request(
    '/api/v1/inventory/consume',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId, quantity: 1000 }),
    },
    env,
  )
  expect(consumed.status).toBe(200)

  const deactivated = await app.request(`/api/v1/locations/${extraId}`, { method: 'DELETE' }, env)
  expect(deactivated.status).toBe(204)

  const remaining = ((await (await app.request('/api/v1/locations', {}, env)).json()) as {
    locations: Array<{ id: string }>
  }).locations
  for (const location of remaining.slice(1)) {
    const res = await app.request(`/api/v1/locations/${location.id}`, { method: 'DELETE' }, env)
    expect(res.status).toBe(204)
  }
  const last = await app.request(`/api/v1/locations/${remaining[0]!.id}`, { method: 'DELETE' }, env)
  expect(last.status).toBe(409)
  await expect(last.json()).resolves.toMatchObject({ code: 'LAST_LOCATION' })
})

test('location writes stay 404 across households', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-a', 'A', 'a@example.invalid')
  insertUser(db, 'user-b', 'B', 'b@example.invalid')
  insertProfile(db, 'user-a', 'A')
  insertProfile(db, 'user-b', 'B')
  await createHousehold(db, 'user-a', 'Casa A')
  await createHousehold(db, 'user-b', 'Casa B')

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-b', name: 'B' })
  const listB = await app.request('/api/v1/locations', {}, envWithDb(db))
  const pantryB = ((await listB.json()) as { locations: Array<{ id: string; name: string }> }).locations.find(
    (location) => location.name === 'Cămară',
  )
  if (!pantryB) {
    throw new Error('missing Cămară')
  }

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-a', name: 'A' })
  const renamed = await app.request(
    `/api/v1/locations/${pantryB.id}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Debara' }),
    },
    envWithDb(db),
  )
  expect(renamed.status).toBe(404)

  const deleted = await app.request(`/api/v1/locations/${pantryB.id}`, { method: 'DELETE' }, envWithDb(db))
  expect(deleted.status).toBe(404)
})
