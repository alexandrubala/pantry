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
  return (await res.json()) as { household: { id: string } }
}

async function fridgeId(db: ReturnType<typeof openPantryDb>) {
  const res = await app.request('/api/v1/locations', {}, envWithDb(db))
  const body = (await res.json()) as { locations: Array<{ id: string; name: string }> }
  const fridge = body.locations.find((location) => location.name === 'Frigider')
  if (!fridge) {
    throw new Error('missing Frigider')
  }
  return fridge.id
}

async function createProduct(
  db: ReturnType<typeof openPantryDb>,
  name: string,
  unit: string,
  brand?: string,
) {
  const res = await app.request(
    '/api/v1/products',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, unit, brand }),
    },
    envWithDb(db),
  )
  expect(res.status).toBe(201)
  return (await res.json()) as { product: { id: string; name: string; unit: string } }
}

test('inventory routes require auth', async () => {
  const env = envWithDb(openPantryDb())
  expect((await app.request('/api/v1/inventory', {}, env)).status).toBe(401)
  expect((await app.request('/api/v1/inventory/history', {}, env)).status).toBe(401)
})

test('add stock, list inventory, consume FEFO, and hide zero-stock products', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')
  const locationId = await fridgeId(db)
  const product = await createProduct(db, 'Lapte', 'ml', 'Pilos')

  await app.request(
    '/api/v1/inventory/stock',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        productId: product.product.id,
        locationId,
        quantity: 500,
        expiresOn: '2026-09-08',
      }),
    },
    envWithDb(db),
  )
  await app.request(
    '/api/v1/inventory/stock',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        productId: product.product.id,
        locationId,
        quantity: 700,
        expiresOn: '2026-09-10',
      }),
    },
    envWithDb(db),
  )
  await app.request(
    '/api/v1/inventory/stock',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        productId: product.product.id,
        locationId,
        quantity: 1000,
        expiresOn: null,
      }),
    },
    envWithDb(db),
  )

  const listed = await app.request('/api/v1/inventory', {}, envWithDb(db))
  expect(listed.status).toBe(200)
  const listedBody = await listed.json()
  expect(listedBody.items).toHaveLength(1)
  expect(listedBody.items[0].totalQuantity).toBe(2200)
  expect(listedBody.items[0].nearestExpiry).toBe('2026-09-08')
  expect(listedBody.items[0].lots).toHaveLength(3)

  const consumed = await app.request(
    '/api/v1/inventory/consume',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: product.product.id, quantity: 900 }),
    },
    envWithDb(db),
  )
  expect(consumed.status).toBe(200)
  const consumedBody = await consumed.json()
  expect(consumedBody.item.totalQuantity).toBe(1300)
  expect(consumedBody.item.lots.map((lot: { quantity: number; expiresOn: string | null }) => lot)).toEqual([
    expect.objectContaining({ quantity: 300, expiresOn: '2026-09-10' }),
    expect.objectContaining({ quantity: 1000, expiresOn: null }),
  ])

  await app.request(
    '/api/v1/inventory/consume',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: product.product.id, quantity: 1300 }),
    },
    envWithDb(db),
  )
  const empty = await app.request('/api/v1/inventory', {}, envWithDb(db))
  expect((await empty.json()).items).toEqual([])

  const products = await app.request('/api/v1/products', {}, envWithDb(db))
  expect((await products.json()).products).toHaveLength(1)
})

test('insufficient stock returns 409 and writes nothing', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')
  const locationId = await fridgeId(db)
  const product = await createProduct(db, 'Lapte', 'ml')

  await app.request(
    '/api/v1/inventory/stock',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: product.product.id, locationId, quantity: 100 }),
    },
    envWithDb(db),
  )

  const res = await app.request(
    '/api/v1/inventory/consume',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: product.product.id, quantity: 250 }),
    },
    envWithDb(db),
  )
  expect(res.status).toBe(409)
  await expect(res.json()).resolves.toEqual({
    error: 'INSUFFICIENT_STOCK',
    code: 'INSUFFICIENT_STOCK',
    available: 100,
  })
  expect(db.prepare('SELECT COUNT(*) AS n FROM inventory_history WHERE action = ?').get('consume')).toEqual({
    n: 0,
  })
  expect(db.prepare('SELECT quantity FROM inventory_lots').get()).toEqual({ quantity: 100 })
})

test('tenancy: household A cannot use household B product, location, lots, or history', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-a', 'A', 'a@example.invalid')
  insertUser(db, 'user-b', 'B', 'b@example.invalid')
  insertProfile(db, 'user-a', 'A')
  insertProfile(db, 'user-b', 'B')
  await createHousehold(db, 'user-a', 'Casa A')
  await createHousehold(db, 'user-b', 'Casa B')

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-b', name: 'B' })
  const locationB = await fridgeId(db)
  const productB = await createProduct(db, 'Secret B', 'ml')
  await app.request(
    '/api/v1/inventory/stock',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        productId: productB.product.id,
        locationId: locationB,
        quantity: 1000,
        expiresOn: '2026-09-12',
      }),
    },
    envWithDb(db),
  )

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-a', name: 'A' })
  const locationA = await fridgeId(db)

  const stockWithBProduct = await app.request(
    '/api/v1/inventory/stock',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: productB.product.id, locationId: locationA, quantity: 1 }),
    },
    envWithDb(db),
  )
  expect(stockWithBProduct.status).toBe(404)

  const stockWithBLocation = await app.request(
    '/api/v1/inventory/stock',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: productB.product.id, locationId: locationB, quantity: 1 }),
    },
    envWithDb(db),
  )
  expect(stockWithBLocation.status).toBe(404)

  const consumeB = await app.request(
    '/api/v1/inventory/consume',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: productB.product.id, quantity: 1 }),
    },
    envWithDb(db),
  )
  expect(consumeB.status).toBe(404)

  const list = await app.request(`/api/v1/inventory?locationId=${locationB}`, {}, envWithDb(db))
  expect(list.status).toBe(404)

  const ownList = await app.request('/api/v1/inventory', {}, envWithDb(db))
  expect((await ownList.json()).items).toEqual([])

  const history = await app.request('/api/v1/inventory/history', {}, envWithDb(db))
  expect((await history.json()).history).toEqual([])

  const historyB = await app.request(
    `/api/v1/inventory/history?productId=${productB.product.id}`,
    {},
    envWithDb(db),
  )
  expect(historyB.status).toBe(404)
})

test('concurrent add-stock creates one lot with quantity 2', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')
  const locationId = await fridgeId(db)
  const product = await createProduct(db, 'Ouă', 'each')
  const env = envWithDb(db)

  const add = () =>
    app.request(
      '/api/v1/inventory/stock',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          productId: product.product.id,
          locationId,
          quantity: 1,
          expiresOn: '2026-09-20',
        }),
      },
      env,
    )

  const [first, second] = await Promise.all([add(), add()])
  expect(first.status).toBe(200)
  expect(second.status).toBe(200)
  expect(db.prepare('SELECT COUNT(*) AS n FROM inventory_lots').get()).toEqual({ n: 1 })
  expect(db.prepare('SELECT quantity FROM inventory_lots').get()).toEqual({ quantity: 2 })
  expect(db.prepare('SELECT COUNT(*) AS n FROM inventory_history WHERE action = ?').get('add')).toEqual({ n: 2 })
})

test('concurrent consume of the last unit yields one success and one conflict', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')
  const locationId = await fridgeId(db)
  const product = await createProduct(db, 'Ouă', 'each')
  const env = envWithDb(db)

  await app.request(
    '/api/v1/inventory/stock',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: product.product.id, locationId, quantity: 1 }),
    },
    env,
  )

  const consume = () =>
    app.request(
      '/api/v1/inventory/consume',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId: product.product.id, quantity: 1 }),
      },
      env,
    )

  const [first, second] = await Promise.all([consume(), consume()])
  const statuses = [first.status, second.status].sort()
  expect(statuses).toEqual([200, 409])

  expect(db.prepare('SELECT COUNT(*) AS n FROM inventory_lots').get()).toEqual({ n: 0 })
  expect(db.prepare('SELECT COUNT(*) AS n FROM inventory_history WHERE action = ?').get('consume')).toEqual({
    n: 1,
  })
  expect(db.prepare('SELECT MIN(quantity) AS q FROM inventory_lots').get()).toEqual({ q: null })
})
