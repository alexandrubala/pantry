import { beforeEach, expect, test, vi } from 'vitest'

vi.mock('../auth/session.js', () => ({
  resolveCurrentUser: vi.fn(),
}))

import { resolveCurrentUser } from '../auth/session.js'
import { app } from '../index'
import { envWithDb, insertProfile, insertUser, openPantryDb } from '../test/sqlite-d1'

const resolveCurrentUserMock = vi.mocked(resolveCurrentUser)

const TINY_JPEG = Uint8Array.from(
  atob(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGf/9k=',
  ),
  (char) => char.charCodeAt(0),
)

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

function lidlDraft() {
  return {
    merchant: 'Lidl',
    date: '2026-09-06',
    currency: 'RON',
    total: 152.4,
    items: [
      {
        rawName: 'LAPTE PILOS 3.5%',
        name: 'Lapte Pilos 3.5%',
        quantity: 1,
        unit: 'package',
        lineTotal: 7.99,
        weightValue: null,
        weightUnit: null,
        confidence: 0.91,
      },
      {
        rawName: 'BANANE',
        name: 'Banane',
        quantity: 1,
        unit: null,
        lineTotal: 5.2,
        weightValue: 0.742,
        weightUnit: 'kg',
        confidence: 0.8,
      },
    ],
  }
}

test('receipt extraction requires auth', async () => {
  const form = new FormData()
  form.append('image', new File([TINY_JPEG], 'receipt.jpg', { type: 'image/jpeg' }))
  const res = await app.request('/api/v1/receipts/extract', { method: 'POST', body: form }, envWithDb(openPantryDb()))
  expect(res.status).toBe(401)
})

test('extracts a receipt draft without writing inventory, products, R2, or D1 images', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')

  const r2Puts: string[] = []
  const gateways: unknown[] = []
  const env = {
    ...envWithDb(db, async (_model, _inputs, options) => {
      gateways.push(options)
      return { response: lidlDraft() }
    }),
    R2: {
      async put(key: string) {
        r2Puts.push(key)
        throw new Error('R2 must not store receipt images')
      },
    },
  }

  const form = new FormData()
  form.append('image', new File([TINY_JPEG], 'receipt.jpg', { type: 'image/jpeg' }))
  const res = await app.request('/api/v1/receipts/extract', { method: 'POST', body: form }, env)
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.receipt.merchant).toBe('Lidl')
  expect(body.receipt.items).toHaveLength(2)
  expect(body.receipt.items[1].suggestedQuantity).toBe(742)
  expect(body.receipt.items[1].suggestedUnit).toBe('g')
  expect(r2Puts).toEqual([])
  expect(db.prepare('SELECT COUNT(*) AS n FROM products').get()).toEqual({ n: 0 })
  expect(db.prepare('SELECT COUNT(*) AS n FROM inventory_lots').get()).toEqual({ n: 0 })
  expect(db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%receipt%'`).all()).toEqual([
    { name: 'receipt_ai_rate_limits' },
  ])
  expect(gateways).toEqual([
    { gateway: { id: 'default', skipCache: true, collectLog: false } },
  ])
})

test('partial OCR, missing total, and no hallucinated inventory writes', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')
  const env = envWithDb(db, async () => ({
    response: {
      merchant: null,
      date: null,
      currency: null,
      total: null,
      pantryProductId: 'nope',
      items: [
        {
          rawName: 'OUĂ',
          name: 'Ouă',
          quantity: 10,
          unit: 'each',
          lineTotal: null,
          weightValue: null,
          weightUnit: null,
          confidence: 0.2,
        },
      ],
    },
  }))
  const form = new FormData()
  form.append('image', new File([TINY_JPEG], 'receipt.jpg', { type: 'image/jpeg' }))
  const res = await app.request('/api/v1/receipts/extract', { method: 'POST', body: form }, env)
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.receipt.total).toBeNull()
  expect(JSON.stringify(body)).not.toMatch(/pantryProductId|nope/)
  expect(db.prepare('SELECT COUNT(*) AS n FROM inventory_lots').get()).toEqual({ n: 0 })
})

test('invalid model output and no items return extraction errors', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')

  const invalidEnv = envWithDb(db, async () => ({ response: 'not-json-object' }))
  const form = new FormData()
  form.append('image', new File([TINY_JPEG], 'receipt.jpg', { type: 'image/jpeg' }))
  const invalid = await app.request('/api/v1/receipts/extract', { method: 'POST', body: form }, invalidEnv)
  expect(invalid.status).toBe(422)

  const emptyEnv = envWithDb(db, async () => ({ response: { merchant: 'Lidl', items: [] } }))
  const emptyForm = new FormData()
  emptyForm.append('image', new File([TINY_JPEG], 'receipt.jpg', { type: 'image/jpeg' }))
  const empty = await app.request('/api/v1/receipts/extract', { method: 'POST', body: emptyForm }, emptyEnv)
  expect(empty.status).toBe(422)
  await expect(empty.json()).resolves.toMatchObject({ code: 'RECEIPT_NO_ITEMS' })
})

test('confirmed commit uses existing product and inventory APIs', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')
  resolveCurrentUserMock.mockResolvedValue({ id: 'user-1', name: 'Alex' })
  const env = envWithDb(db)

  const locations = await app.request('/api/v1/locations', {}, env)
  const fridge = ((await locations.json()) as { locations: Array<{ id: string; name: string }> }).locations.find(
    (location) => location.name === 'Frigider',
  )
  if (!fridge) {
    throw new Error('missing Frigider')
  }

  const created = await app.request(
    '/api/v1/products',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Lapte Pilos 3.5%', unit: 'ml' }),
    },
    env,
  )
  expect(created.status).toBe(201)
  const productId = ((await created.json()) as { product: { id: string } }).product.id

  const added = await app.request(
    '/api/v1/inventory/stock',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId, locationId: fridge.id, quantity: 1000, expiresOn: null }),
    },
    env,
  )
  expect(added.status).toBe(200)
  expect(((await added.json()) as { item: { totalQuantity: number } }).item.totalQuantity).toBe(1000)
})
