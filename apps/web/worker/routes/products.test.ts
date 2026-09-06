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

test('GET /api/v1/products requires auth and an active household', async () => {
  const db = openPantryDb()
  const env = envWithDb(db)

  expect((await app.request('/api/v1/products', {}, env)).status).toBe(401)

  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  resolveCurrentUserMock.mockResolvedValue({ id: 'user-1', name: 'Alex' })
  const setupRequired = await app.request('/api/v1/products', {}, env)
  expect(setupRequired.status).toBe(409)
})

test('POST /api/v1/products creates a household-scoped manual product', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  const household = await createHousehold(db, 'user-1', 'Casa mea')

  const created = await app.request(
    '/api/v1/products',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '  Lapte  ', brand: 'Pilos', unit: 'ml' }),
    },
    envWithDb(db),
  )
  expect(created.status).toBe(201)
  const body = await created.json()
  expect(body.product).toMatchObject({ name: 'Lapte', brand: 'Pilos', unit: 'ml' })

  const row = db.prepare('SELECT household_id, source, barcode FROM products WHERE id = ?').get(body.product.id)
  expect(row).toEqual({
    household_id: household.household.id,
    source: 'manual',
    barcode: null,
  })
})

test('GET /api/v1/products never returns another household product', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-a', 'A', 'a@example.invalid')
  insertUser(db, 'user-b', 'B', 'b@example.invalid')
  insertProfile(db, 'user-a', 'A')
  insertProfile(db, 'user-b', 'B')
  await createHousehold(db, 'user-a', 'Casa A')
  await createHousehold(db, 'user-b', 'Casa B')

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-b', name: 'B' })
  await app.request(
    '/api/v1/products',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Secret B', unit: 'g' }),
    },
    envWithDb(db),
  )

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-a', name: 'A' })
  const list = await app.request('/api/v1/products', {}, envWithDb(db))
  const body = await list.json()
  expect(body.products).toEqual([])
  expect(JSON.stringify(body)).not.toMatch(/Secret B/)
})

test('GET /api/v1/products search is household-scoped', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')

  await app.request(
    '/api/v1/products',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Lapte', unit: 'ml' }),
    },
    envWithDb(db),
  )
  await app.request(
    '/api/v1/products',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ouă', unit: 'each' }),
    },
    envWithDb(db),
  )

  const list = await app.request('/api/v1/products?search=lapte', {}, envWithDb(db))
  const body = await list.json()
  expect(body.products).toHaveLength(1)
  expect(body.products[0].name).toBe('Lapte')
})

test('POST /api/v1/products can attach a household-private barcode', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  const household = await createHousehold(db, 'user-1', 'Casa mea')

  const created = await app.request(
    '/api/v1/products',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Cafea', unit: 'g', barcode: '01234565' }),
    },
    envWithDb(db),
  )
  expect(created.status).toBe(201)
  const body = await created.json()
  expect(body.product.barcode).toBe('01234565')

  const row = db.prepare('SELECT household_id, source, barcode FROM products WHERE id = ?').get(body.product.id)
  expect(row).toEqual({
    household_id: household.household.id,
    source: 'manual',
    barcode: '01234565',
  })

  const duplicate = await app.request(
    '/api/v1/products',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Altă cafea', unit: 'g', barcode: '01234565' }),
    },
    envWithDb(db),
  )
  expect(duplicate.status).toBe(409)
})
