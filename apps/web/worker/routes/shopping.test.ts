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
) {
  const res = await app.request(
    '/api/v1/products',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, unit }),
    },
    envWithDb(db),
  )
  expect(res.status).toBe(201)
  return (await res.json()) as { product: { id: string; name: string; unit: string } }
}

test('shopping routes require auth', async () => {
  const env = envWithDb(openPantryDb())
  expect((await app.request('/api/v1/shopping', {}, env)).status).toBe(401)
  expect(
    (
      await app.request(
        '/api/v1/shopping/items',
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
        env,
      )
    ).status,
  ).toBe(401)
})

test('get shopping lazily creates one active list and supports manual items, merge, toggle, and clear', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')
  const env = envWithDb(db)

  const empty = await app.request('/api/v1/shopping', {}, env)
  expect(empty.status).toBe(200)
  const emptyBody = (await empty.json()) as { list: { id: string; items: unknown[] } }
  expect(emptyBody.list.items).toEqual([])

  const again = await app.request('/api/v1/shopping', {}, env)
  expect((await again.json() as { list: { id: string } }).list.id).toBe(emptyBody.list.id)

  const manual = await app.request(
    '/api/v1/shopping/items',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Hârtie de bucătărie', quantity: 2, unit: 'package' }),
    },
    env,
  )
  expect(manual.status).toBe(200)
  const manualItem = (await manual.json() as { item: { id: string; name: string; productId: string | null } }).item
  expect(manualItem.name).toBe('Hârtie de bucătărie')
  expect(manualItem.productId).toBeNull()

  const product = await createProduct(db, 'Lapte', 'package')
  await app.request(
    '/api/v1/shopping/items/product',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: product.product.id, quantity: 1, unit: 'package' }),
    },
    env,
  )
  const merged = await app.request(
    '/api/v1/shopping/items/product',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: product.product.id, quantity: 1, unit: 'package' }),
    },
    env,
  )
  expect((await merged.json() as { item: { quantity: number } }).item.quantity).toBe(2)

  const listed = await app.request('/api/v1/shopping', {}, env)
  const listedBody = (await listed.json()) as {
    list: { items: Array<{ id: string; name: string; checked: boolean; quantity: number | null }> }
  }
  expect(listedBody.list.items).toHaveLength(2)
  expect(listedBody.list.items[0]?.checked).toBe(false)
  const lapte = listedBody.list.items.find((item) => item.name === 'Lapte')
  expect(lapte?.quantity).toBe(2)

  const toggled = await app.request(
    `/api/v1/shopping/items/${lapte?.id}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ checked: true }),
    },
    env,
  )
  expect(toggled.status).toBe(200)
  expect((await toggled.json() as { item: { checked: boolean } }).item.checked).toBe(true)

  const afterCheck = await app.request('/api/v1/shopping', {}, env)
  const afterCheckBody = (await afterCheck.json()) as {
    list: { items: Array<{ name: string; checked: boolean }> }
  }
  expect(afterCheckBody.list.items.map((item) => item.checked)).toEqual([false, true])

  await app.request(`/api/v1/shopping/items/${manualItem.id}`, { method: 'DELETE' }, env)
  const cleared = await app.request('/api/v1/shopping/clear-completed', { method: 'POST' }, env)
  expect(cleared.status).toBe(200)
  expect((await cleared.json() as { list: { items: unknown[] } }).list.items).toEqual([])
  expect(db.prepare(`SELECT COUNT(*) AS n FROM shopping_lists WHERE status = 'archived'`).get()).toEqual({
    n: 0,
  })
})

test('checking a shopping item does not modify inventory', async () => {
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
      body: JSON.stringify({ productId: product.product.id, locationId, quantity: 10 }),
    },
    env,
  )
  const added = await app.request(
    '/api/v1/shopping/items/product',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: product.product.id, quantity: 2, unit: 'each' }),
    },
    env,
  )
  const itemId = (await added.json() as { item: { id: string } }).item.id

  const checked = await app.request(
    `/api/v1/shopping/items/${itemId}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ checked: true }),
    },
    env,
  )
  expect(checked.status).toBe(200)
  expect(db.prepare('SELECT quantity FROM inventory_lots').get()).toEqual({ quantity: 10 })
  expect(db.prepare('SELECT COUNT(*) AS n FROM inventory_history').get()).toEqual({ n: 1 })
  expect(db.prepare('SELECT action FROM inventory_history').get()).toEqual({ action: 'add' })
})

test('tenancy: user A cannot see or mutate user B shopping data', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-a', 'A', 'a@example.invalid')
  insertUser(db, 'user-b', 'B', 'b@example.invalid')
  insertProfile(db, 'user-a', 'A')
  insertProfile(db, 'user-b', 'B')
  await createHousehold(db, 'user-a', 'Casa A')
  await createHousehold(db, 'user-b', 'Casa B')

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-b', name: 'B' })
  const productB = await createProduct(db, 'Secret B', 'package')
  const added = await app.request(
    '/api/v1/shopping/items/product',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: productB.product.id, quantity: 1, unit: 'package' }),
    },
    envWithDb(db),
  )
  const itemB = (await added.json() as { item: { id: string } }).item

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-a', name: 'A' })
  const listA = await app.request('/api/v1/shopping', {}, envWithDb(db))
  expect((await listA.json() as { list: { items: unknown[] } }).list.items).toEqual([])

  const toggleB = await app.request(
    `/api/v1/shopping/items/${itemB.id}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ checked: true }),
    },
    envWithDb(db),
  )
  expect(toggleB.status).toBe(404)

  const deleteB = await app.request(
    `/api/v1/shopping/items/${itemB.id}`,
    { method: 'DELETE' },
    envWithDb(db),
  )
  expect(deleteB.status).toBe(404)

  const addBProduct = await app.request(
    '/api/v1/shopping/items/product',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: productB.product.id, quantity: 1, unit: 'package' }),
    },
    envWithDb(db),
  )
  expect(addBProduct.status).toBe(404)
})

test('concurrent get shopping creates a single active list', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')
  const env = envWithDb(db)

  const [first, second] = await Promise.all([
    app.request('/api/v1/shopping', {}, env),
    app.request('/api/v1/shopping', {}, env),
  ])
  expect(first.status).toBe(200)
  expect(second.status).toBe(200)
  const firstId = (await first.json() as { list: { id: string } }).list.id
  const secondId = (await second.json() as { list: { id: string } }).list.id
  expect(firstId).toBe(secondId)
  expect(db.prepare(`SELECT COUNT(*) AS n FROM shopping_lists WHERE status = 'active'`).get()).toEqual({
    n: 1,
  })
})
