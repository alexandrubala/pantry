import { beforeEach, expect, test, vi } from 'vitest'

vi.mock('../auth/session.js', () => ({
  resolveCurrentUser: vi.fn(),
}))

import { resolveCurrentUser } from '../auth/session.js'
import { app } from '../index'
import { envWithDb, insertProfile, insertUser, openPantryDb } from '../test/sqlite-d1'

const resolveCurrentUserMock = vi.mocked(resolveCurrentUser)
const TODAY = '2026-09-06'

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

async function locationId(db: ReturnType<typeof openPantryDb>, name: string) {
  const res = await app.request('/api/v1/locations', {}, envWithDb(db))
  const body = (await res.json()) as { locations: Array<{ id: string; name: string }> }
  const location = body.locations.find((entry) => entry.name === name)
  if (!location) {
    throw new Error(`missing ${name}`)
  }
  return location.id
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

async function addStock(
  db: ReturnType<typeof openPantryDb>,
  input: { productId: string; locationId: string; quantity: number; expiresOn?: string | null },
) {
  const res = await app.request(
    '/api/v1/inventory/stock',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
    envWithDb(db),
  )
  expect(res.status).toBe(200)
  return res
}

test('new inventory polish routes require auth', async () => {
  const env = envWithDb(openPantryDb())
  expect((await app.request('/api/v1/inventory/summary', {}, env)).status).toBe(401)
  expect((await app.request('/api/v1/inventory/expiring', {}, env)).status).toBe(401)
  expect(
    (
      await app.request(
        '/api/v1/inventory/settings/p1',
        { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ minimumQuantity: 1 }) },
        env,
      )
    ).status,
  ).toBe(401)
  expect(
    (
      await app.request(
        '/api/v1/inventory/adjust',
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
        env,
      )
    ).status,
  ).toBe(401)
  expect(
    (
      await app.request(
        '/api/v1/inventory/move',
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
        env,
      )
    ).status,
  ).toBe(401)
  expect(
    (
      await app.request(
        '/api/v1/inventory/lots/lot-1',
        { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{}' },
        env,
      )
    ).status,
  ).toBe(401)
})

test('low stock is deterministic including zero-lot tracked products', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')
  const fridge = await locationId(db, 'Frigider')
  const eggs = await createProduct(db, 'Ouă', 'each')

  await addStock(db, { productId: eggs.product.id, locationId: fridge, quantity: 11 })
  await app.request(
    `/api/v1/inventory/settings/${eggs.product.id}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ minimumQuantity: 10 }),
    },
    envWithDb(db),
  )

  let listed = await (await app.request('/api/v1/inventory', {}, envWithDb(db))).json()
  expect(listed.items[0].lowStock).toBe(false)
  expect(listed.items[0].minimumQuantity).toBe(10)

  await app.request(
    '/api/v1/inventory/consume',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: eggs.product.id, quantity: 1 }),
    },
    envWithDb(db),
  )
  listed = await (await app.request('/api/v1/inventory', {}, envWithDb(db))).json()
  expect(listed.items[0].totalQuantity).toBe(10)
  expect(listed.items[0].lowStock).toBe(true)

  await app.request(
    '/api/v1/inventory/consume',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: eggs.product.id, quantity: 1 }),
    },
    envWithDb(db),
  )
  listed = await (await app.request('/api/v1/inventory', {}, envWithDb(db))).json()
  expect(listed.items[0].totalQuantity).toBe(9)
  expect(listed.items[0].lowStock).toBe(true)

  await app.request(
    `/api/v1/inventory/settings/${eggs.product.id}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ minimumQuantity: 0 }),
    },
    envWithDb(db),
  )
  listed = await (await app.request('/api/v1/inventory', {}, envWithDb(db))).json()
  expect(listed.items[0].lowStock).toBe(false)

  const rice = await createProduct(db, 'Orez', 'g')
  await app.request(
    `/api/v1/inventory/settings/${rice.product.id}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ minimumQuantity: 500 }),
    },
    envWithDb(db),
  )
  listed = await (await app.request('/api/v1/inventory', {}, envWithDb(db))).json()
  const riceItem = listed.items.find((item: { product: { name: string } }) => item.product.name === 'Orez')
  expect(riceItem).toMatchObject({ totalQuantity: 0, lowStock: true, minimumQuantity: 500, lots: [] })

  const summary = await (
    await app.request(`/api/v1/inventory/summary?today=${TODAY}`, {}, envWithDb(db))
  ).json()
  expect(summary.lowStock).toBe(1)
  expect(summary.products).toBeGreaterThanOrEqual(2)
})

test('expiry classification is DATE-ONLY with a 7-day window', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')
  const fridge = await locationId(db, 'Frigider')
  const yogurt = await createProduct(db, 'Iaurt', 'each')

  await addStock(db, { productId: yogurt.product.id, locationId: fridge, quantity: 1, expiresOn: '2026-09-05' })
  await addStock(db, { productId: yogurt.product.id, locationId: fridge, quantity: 1, expiresOn: '2026-09-06' })
  await addStock(db, { productId: yogurt.product.id, locationId: fridge, quantity: 1, expiresOn: '2026-09-07' })
  await addStock(db, { productId: yogurt.product.id, locationId: fridge, quantity: 1, expiresOn: '2026-09-13' })
  await addStock(db, { productId: yogurt.product.id, locationId: fridge, quantity: 1, expiresOn: '2026-09-14' })
  await addStock(db, { productId: yogurt.product.id, locationId: fridge, quantity: 1, expiresOn: null })

  const expiring = await (
    await app.request(`/api/v1/inventory/expiring?today=${TODAY}&days=7`, {}, envWithDb(db))
  ).json()
  expect(expiring.lots.map((lot: { expiresOn: string; status: string }) => [lot.expiresOn, lot.status])).toEqual([
    ['2026-09-05', 'expired'],
    ['2026-09-06', 'today'],
    ['2026-09-07', 'tomorrow'],
    ['2026-09-13', 'soon'],
  ])

  const summary = await (
    await app.request(`/api/v1/inventory/summary?today=${TODAY}`, {}, envWithDb(db))
  ).json()
  expect(summary).toMatchObject({ lots: 6, expired: 1, expiringSoon: 3 })
})

test('adjust sets exact quantity, writes delta history, and removes empty lots', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')
  const fridge = await locationId(db, 'Frigider')
  const milk = await createProduct(db, 'Lapte', 'ml')
  await addStock(db, { productId: milk.product.id, locationId: fridge, quantity: 10 })

  const lotId = (db.prepare('SELECT id FROM inventory_lots').get() as { id: string }).id

  const down = await app.request(
    '/api/v1/inventory/adjust',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lotId, expectedQuantity: 10, quantity: 8 }),
    },
    envWithDb(db),
  )
  expect(down.status).toBe(200)
  expect(db.prepare('SELECT quantity FROM inventory_lots').get()).toEqual({ quantity: 8 })
  expect(
    db.prepare('SELECT delta_quantity AS d FROM inventory_history WHERE action = ? ORDER BY created_at DESC').get('adjust'),
  ).toEqual({ d: -2 })

  const up = await app.request(
    '/api/v1/inventory/adjust',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lotId, expectedQuantity: 8, quantity: 12 }),
    },
    envWithDb(db),
  )
  expect(up.status).toBe(200)
  expect(db.prepare('SELECT quantity FROM inventory_lots').get()).toEqual({ quantity: 12 })

  const zero = await app.request(
    '/api/v1/inventory/adjust',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lotId, expectedQuantity: 12, quantity: 0 }),
    },
    envWithDb(db),
  )
  expect(zero.status).toBe(200)
  expect(db.prepare('SELECT COUNT(*) AS n FROM inventory_lots').get()).toEqual({ n: 0 })
  const adjustDeltas = (
    db
      .prepare('SELECT delta_quantity AS d FROM inventory_history WHERE action = ? ORDER BY created_at ASC, id ASC')
      .all('adjust') as Array<{ d: number }>
  ).map((row) => row.d)
  expect(adjustDeltas).toEqual(expect.arrayContaining([-2, 4, -12]))
  expect(adjustDeltas).toHaveLength(3)
  expect((await zero.json()).item).toBeNull()
})

test('stale adjustment returns 409 INVENTORY_CHANGED and does not overwrite a concurrent add', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')
  const fridge = await locationId(db, 'Frigider')
  const milk = await createProduct(db, 'Lapte', 'ml')
  await addStock(db, { productId: milk.product.id, locationId: fridge, quantity: 10, expiresOn: null })
  const lotId = (db.prepare('SELECT id FROM inventory_lots').get() as { id: string }).id

  await addStock(db, { productId: milk.product.id, locationId: fridge, quantity: 5, expiresOn: null })
  expect(db.prepare('SELECT quantity FROM inventory_lots').get()).toEqual({ quantity: 15 })

  const stale = await app.request(
    '/api/v1/inventory/adjust',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lotId, expectedQuantity: 10, quantity: 8 }),
    },
    envWithDb(db),
  )
  expect(stale.status).toBe(409)
  await expect(stale.json()).resolves.toEqual({ error: 'INVENTORY_CHANGED', code: 'INVENTORY_CHANGED' })
  expect(db.prepare('SELECT quantity FROM inventory_lots').get()).toEqual({ quantity: 15 })
  expect(db.prepare('SELECT COUNT(*) AS n FROM inventory_history WHERE action = ?').get('adjust')).toEqual({ n: 0 })
})

test('move preserves quantity and expiry, merges matching destination lots, and rejects other households', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-a', 'A', 'a@example.invalid')
  insertUser(db, 'user-b', 'B', 'b@example.invalid')
  insertProfile(db, 'user-a', 'A')
  insertProfile(db, 'user-b', 'B')
  await createHousehold(db, 'user-a', 'Casa A')
  const fridgeA = await locationId(db, 'Frigider')
  const freezerA = await locationId(db, 'Congelator')
  const milk = await createProduct(db, 'Lapte', 'ml')
  await addStock(db, {
    productId: milk.product.id,
    locationId: fridgeA,
    quantity: 700,
    expiresOn: '2026-09-12',
  })
  const lotId = (db.prepare('SELECT id FROM inventory_lots').get() as { id: string }).id

  const moved = await app.request(
    '/api/v1/inventory/move',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lotId, locationId: freezerA }),
    },
    envWithDb(db),
  )
  expect(moved.status).toBe(200)
  const movedBody = await moved.json()
  expect(movedBody.item.lots).toEqual([
    expect.objectContaining({ locationId: freezerA, quantity: 700, expiresOn: '2026-09-12' }),
  ])
  expect(db.prepare('SELECT COUNT(*) AS n FROM inventory_history WHERE action = ?').get('move')).toEqual({ n: 2 })

  await addStock(db, {
    productId: milk.product.id,
    locationId: fridgeA,
    quantity: 500,
    expiresOn: '2026-09-12',
  })
  const fridgeLotId = (
    db.prepare('SELECT id FROM inventory_lots WHERE location_id = ?').get(fridgeA) as { id: string }
  ).id
  const merged = await app.request(
    '/api/v1/inventory/move',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lotId: fridgeLotId, locationId: freezerA }),
    },
    envWithDb(db),
  )
  expect(merged.status).toBe(200)
  expect((await merged.json()).item.lots).toEqual([
    expect.objectContaining({ locationId: freezerA, quantity: 1200, expiresOn: '2026-09-12' }),
  ])
  expect(db.prepare('SELECT COUNT(*) AS n FROM inventory_lots').get()).toEqual({ n: 1 })
  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])

  await createHousehold(db, 'user-b', 'Casa B')
  const freezerB = await locationId(db, 'Congelator')
  resolveCurrentUserMock.mockResolvedValue({ id: 'user-a', name: 'A' })
  const cross = await app.request(
    '/api/v1/inventory/move',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lotId, locationId: freezerB }),
    },
    envWithDb(db),
  )
  expect(cross.status).toBe(404)
})

test('tenancy: household A cannot edit, adjust, move, configure, or read household B inventory', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-a', 'A', 'a@example.invalid')
  insertUser(db, 'user-b', 'B', 'b@example.invalid')
  insertProfile(db, 'user-a', 'A')
  insertProfile(db, 'user-b', 'B')
  await createHousehold(db, 'user-a', 'Casa A')
  await createHousehold(db, 'user-b', 'Casa B')

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-b', name: 'B' })
  const fridgeB = await locationId(db, 'Frigider')
  const productB = await createProduct(db, 'Secret B', 'ml')
  await addStock(db, { productId: productB.product.id, locationId: fridgeB, quantity: 1000 })
  const lotB = (db.prepare('SELECT id FROM inventory_lots').get() as { id: string }).id

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-a', name: 'A' })
  const fridgeA = await locationId(db, 'Frigider')

  expect(
    (
      await app.request(
        `/api/v1/products/${productB.product.id}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Stolen' }),
        },
        envWithDb(db),
      )
    ).status,
  ).toBe(404)
  expect(
    (
      await app.request(
        `/api/v1/inventory/settings/${productB.product.id}`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ minimumQuantity: 1 }),
        },
        envWithDb(db),
      )
    ).status,
  ).toBe(404)
  expect(
    (
      await app.request(
        '/api/v1/inventory/adjust',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ lotId: lotB, expectedQuantity: 1000, quantity: 1 }),
        },
        envWithDb(db),
      )
    ).status,
  ).toBe(404)
  expect(
    (
      await app.request(
        '/api/v1/inventory/move',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ lotId: lotB, locationId: fridgeA }),
        },
        envWithDb(db),
      )
    ).status,
  ).toBe(404)
  expect(
    (
      await app.request(
        `/api/v1/inventory/history?productId=${productB.product.id}`,
        {},
        envWithDb(db),
      )
    ).status,
  ).toBe(404)
  const summary = await (await app.request(`/api/v1/inventory/summary?today=${TODAY}`, {}, envWithDb(db))).json()
  expect(summary).toEqual({ products: 0, lots: 0, lowStock: 0, expiringSoon: 0, expired: 0 })
  const expiring = await (await app.request(`/api/v1/inventory/expiring?today=${TODAY}`, {}, envWithDb(db))).json()
  expect(expiring.lots).toEqual([])
})

test('local daily-use flow persists across reload', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')
  const fridge = await locationId(db, 'Frigider')
  const freezer = await locationId(db, 'Congelator')

  const milk = await createProduct(db, 'Lapte', 'ml', 'Pilos')
  const eggs = await createProduct(db, 'Ouă', 'each')
  const chicken = await createProduct(db, 'Piept de pui', 'g')
  const yogurt = await createProduct(db, 'Iaurt', 'each')

  await addStock(db, { productId: milk.product.id, locationId: fridge, quantity: 1000, expiresOn: '2026-09-20' })
  await addStock(db, { productId: eggs.product.id, locationId: fridge, quantity: 4 })
  await addStock(db, {
    productId: chicken.product.id,
    locationId: freezer,
    quantity: 500,
    expiresOn: '2026-09-05',
  })
  await addStock(db, { productId: yogurt.product.id, locationId: fridge, quantity: 2, expiresOn: '2026-09-08' })

  await app.request(
    `/api/v1/inventory/settings/${eggs.product.id}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ minimumQuantity: 6 }),
    },
    envWithDb(db),
  )

  const summary = await (
    await app.request(`/api/v1/inventory/summary?today=${TODAY}`, {}, envWithDb(db))
  ).json()
  expect(summary).toMatchObject({ products: 4, lots: 4, lowStock: 1, expiringSoon: 1, expired: 1 })

  const shop = await app.request(
    '/api/v1/shopping/items/product',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: eggs.product.id, quantity: 6, unit: 'each' }),
    },
    envWithDb(db),
  )
  expect(shop.status).toBe(200)

  const milkLot = (
    db.prepare('SELECT id, quantity FROM inventory_lots WHERE product_id = ?').get(milk.product.id) as {
      id: string
      quantity: number
    }
  )
  await app.request(
    '/api/v1/inventory/adjust',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lotId: milkLot.id, expectedQuantity: milkLot.quantity, quantity: 900 }),
    },
    envWithDb(db),
  )
  await app.request(
    '/api/v1/inventory/move',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lotId: milkLot.id, locationId: freezer }),
    },
    envWithDb(db),
  )
  await app.request(
    '/api/v1/inventory/consume',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: yogurt.product.id, quantity: 1 }),
    },
    envWithDb(db),
  )

  const history = await (await app.request('/api/v1/inventory/history', {}, envWithDb(db))).json()
  expect(history.history[0].productName).toBeTruthy()
  expect(history.history.some((entry: { action: string }) => entry.action === 'adjust')).toBe(true)
  expect(history.history.some((entry: { action: string }) => entry.action === 'move')).toBe(true)

  const reloaded = await (await app.request('/api/v1/inventory', {}, envWithDb(db))).json()
  expect(reloaded.items).toHaveLength(4)
  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})
