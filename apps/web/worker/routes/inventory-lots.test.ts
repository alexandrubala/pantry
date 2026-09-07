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
  return (await res.json()) as {
    item: {
      totalQuantity: number
      lots: Array<{ id: string; quantity: number; locationId: string; expiresOn: string | null }>
    }
  }
}

function lotRow(
  db: ReturnType<typeof openPantryDb>,
  productId: string,
  expiresOn: string | null,
) {
  if (expiresOn == null) {
    return db
      .prepare(
        `SELECT id, quantity, expires_on AS expiresOn, location_id AS locationId
         FROM inventory_lots
         WHERE product_id = ? AND expires_on IS NULL`,
      )
      .get(productId) as { id: string; quantity: number; expiresOn: string | null; locationId: string }
  }

  return db
    .prepare(
      `SELECT id, quantity, expires_on AS expiresOn, location_id AS locationId
       FROM inventory_lots
       WHERE product_id = ? AND expires_on = ?`,
    )
    .get(productId, expiresOn) as { id: string; quantity: number; expiresOn: string | null; locationId: string }
}

async function patchLot(
  db: ReturnType<typeof openPantryDb>,
  lotId: string,
  body: {
    expected: { quantity: number; locationId: string; expiresOn: string | null }
    quantity: number
    locationId: string
    expiresOn: string | null
  },
) {
  return app.request(
    `/api/v1/inventory/lots/${lotId}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    envWithDb(db),
  )
}

test('lot edit updates quantity, expiry, location, and removes a lot at zero', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')
  const pantry = await locationId(db, 'Cămară')
  const fridge = await locationId(db, 'Frigider')
  const barilla = await createProduct(db, 'Barilla Penne', 'package', 'Barilla')

  await addStock(db, { productId: barilla.product.id, locationId: pantry, quantity: 3, expiresOn: null })
  const none = lotRow(db, barilla.product.id, null)

  const down = await patchLot(db, none.id, {
    expected: { quantity: 3, locationId: pantry, expiresOn: null },
    quantity: 1,
    locationId: pantry,
    expiresOn: null,
  })
  expect(down.status).toBe(200)
  expect(lotRow(db, barilla.product.id, null).quantity).toBe(1)

  const up = await patchLot(db, none.id, {
    expected: { quantity: 1, locationId: pantry, expiresOn: null },
    quantity: 5,
    locationId: pantry,
    expiresOn: null,
  })
  expect(up.status).toBe(200)
  expect(lotRow(db, barilla.product.id, null).quantity).toBe(5)

  const addExpiry = await patchLot(db, none.id, {
    expected: { quantity: 5, locationId: pantry, expiresOn: null },
    quantity: 5,
    locationId: pantry,
    expiresOn: '2027-01-20',
  })
  expect(addExpiry.status).toBe(200)
  expect(lotRow(db, barilla.product.id, '2027-01-20')).toMatchObject({ quantity: 5, locationId: pantry })
  expect(db.prepare('SELECT COUNT(*) AS n FROM inventory_lots').get()).toEqual({ n: 1 })
  expect(db.prepare('SELECT action FROM inventory_history WHERE action = ?').get('edit')).toEqual({
    action: 'edit',
  })

  const jan = lotRow(db, barilla.product.id, '2027-01-20')
  const changeExpiry = await patchLot(db, jan.id, {
    expected: { quantity: 5, locationId: pantry, expiresOn: '2027-01-20' },
    quantity: 5,
    locationId: pantry,
    expiresOn: '2026-11-15',
  })
  expect(changeExpiry.status).toBe(200)
  expect(lotRow(db, barilla.product.id, '2026-11-15').quantity).toBe(5)

  const nov = lotRow(db, barilla.product.id, '2026-11-15')
  const clearExpiry = await patchLot(db, nov.id, {
    expected: { quantity: 5, locationId: pantry, expiresOn: '2026-11-15' },
    quantity: 5,
    locationId: pantry,
    expiresOn: null,
  })
  expect(clearExpiry.status).toBe(200)
  expect(lotRow(db, barilla.product.id, null).quantity).toBe(5)

  const moved = await patchLot(db, none.id, {
    expected: { quantity: 5, locationId: pantry, expiresOn: null },
    quantity: 4,
    locationId: fridge,
    expiresOn: '2027-05-01',
  })
  expect(moved.status).toBe(200)
  expect(lotRow(db, barilla.product.id, '2027-05-01')).toMatchObject({ quantity: 4, locationId: fridge })

  const may = lotRow(db, barilla.product.id, '2027-05-01')
  const zero = await patchLot(db, may.id, {
    expected: { quantity: 4, locationId: fridge, expiresOn: '2027-05-01' },
    quantity: 0,
    locationId: fridge,
    expiresOn: '2027-05-01',
  })
  expect(zero.status).toBe(200)
  expect(db.prepare('SELECT COUNT(*) AS n FROM inventory_lots').get()).toEqual({ n: 0 })
  expect((await zero.json()).item).toBeNull()
})

test('changing expiry onto an existing lot merges quantities atomically', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')
  const pantry = await locationId(db, 'Cămară')
  const barilla = await createProduct(db, 'Barilla Penne', 'package')

  await addStock(db, { productId: barilla.product.id, locationId: pantry, quantity: 2, expiresOn: '2026-11-15' })
  await addStock(db, { productId: barilla.product.id, locationId: pantry, quantity: 3, expiresOn: '2027-01-20' })
  const nov = lotRow(db, barilla.product.id, '2026-11-15')

  const merged = await patchLot(db, nov.id, {
    expected: { quantity: 2, locationId: pantry, expiresOn: '2026-11-15' },
    quantity: 2,
    locationId: pantry,
    expiresOn: '2027-01-20',
  })
  expect(merged.status).toBe(200)
  const body = await merged.json()
  expect(body.item.lots).toEqual([
    expect.objectContaining({ quantity: 5, expiresOn: '2027-01-20', locationId: pantry }),
  ])
  expect(db.prepare('SELECT COUNT(*) AS n FROM inventory_lots').get()).toEqual({ n: 1 })
  expect(db.prepare('SELECT quantity FROM inventory_lots').get()).toEqual({ quantity: 5 })
  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})

test('per-lot plus upserts the exact expiry lot and leaves others unchanged', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')
  const pantry = await locationId(db, 'Cămară')
  const barilla = await createProduct(db, 'Barilla Penne', 'package')

  await addStock(db, { productId: barilla.product.id, locationId: pantry, quantity: 2, expiresOn: '2026-11-15' })
  await addStock(db, { productId: barilla.product.id, locationId: pantry, quantity: 3, expiresOn: '2027-01-20' })

  const added = await addStock(db, {
    productId: barilla.product.id,
    locationId: pantry,
    quantity: 1,
    expiresOn: '2026-11-15',
  })
  expect(added.item.totalQuantity).toBe(6)
  expect(lotRow(db, barilla.product.id, '2026-11-15').quantity).toBe(3)
  expect(lotRow(db, barilla.product.id, '2027-01-20').quantity).toBe(3)
  expect(db.prepare('SELECT COUNT(*) AS n FROM inventory_history WHERE action = ?').get('add')).toEqual({ n: 3 })
})

test('multiple expiry lots stay separate and FEFO consume uses Nov then Jan then none', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')
  const pantry = await locationId(db, 'Cămară')
  const barilla = await createProduct(db, 'Barilla Penne', 'package')

  await addStock(db, { productId: barilla.product.id, locationId: pantry, quantity: 2, expiresOn: '2026-11-15' })
  await addStock(db, { productId: barilla.product.id, locationId: pantry, quantity: 3, expiresOn: '2027-01-20' })
  await addStock(db, { productId: barilla.product.id, locationId: pantry, quantity: 1, expiresOn: null })

  const listed = await (await app.request('/api/v1/inventory', {}, envWithDb(db))).json()
  expect(listed.items[0].totalQuantity).toBe(6)
  expect(listed.items[0].lots.map((lot: { quantity: number; expiresOn: string | null }) => [lot.quantity, lot.expiresOn])).toEqual(
    [
      [2, '2026-11-15'],
      [3, '2027-01-20'],
      [1, null],
    ],
  )

  const consumeNov = await app.request(
    '/api/v1/inventory/consume',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: barilla.product.id, quantity: 2 }),
    },
    envWithDb(db),
  )
  expect(consumeNov.status).toBe(200)
  expect(db.prepare('SELECT COUNT(*) AS n FROM inventory_lots WHERE expires_on = ?').get('2026-11-15')).toEqual({
    n: 0,
  })
  expect(lotRow(db, barilla.product.id, '2027-01-20').quantity).toBe(3)
  expect(lotRow(db, barilla.product.id, null).quantity).toBe(1)

  const consumeJan = await app.request(
    '/api/v1/inventory/consume',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: barilla.product.id, quantity: 3 }),
    },
    envWithDb(db),
  )
  expect(consumeJan.status).toBe(200)
  expect(db.prepare('SELECT COUNT(*) AS n FROM inventory_lots').get()).toEqual({ n: 1 })
  expect(lotRow(db, barilla.product.id, null).quantity).toBe(1)
})

test('shared household stale lot edit returns 409 and keeps the concurrent add', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-a', 'Alex', 'alex@example.invalid')
  insertUser(db, 'user-b', 'Maria', 'maria@example.invalid')
  insertProfile(db, 'user-a', 'Alex')
  insertProfile(db, 'user-b', 'Maria')
  await createHousehold(db, 'user-a', 'Casa comună')
  const pantry = await locationId(db, 'Cămară')
  const barilla = await createProduct(db, 'Barilla Penne', 'package')
  await addStock(db, { productId: barilla.product.id, locationId: pantry, quantity: 2, expiresOn: '2026-11-15' })
  const nov = lotRow(db, barilla.product.id, '2026-11-15')

  const invite = await app.request('/api/v1/household/invites', { method: 'POST' }, envWithDb(db))
  expect(invite.status).toBe(201)
  const inviteBody = (await invite.json()) as { invite: { token: string } }

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-b', name: 'Maria' })
  const accepted = await app.request(
    `/api/v1/invites/${inviteBody.invite.token}/accept`,
    { method: 'POST' },
    envWithDb(db),
  )
  expect(accepted.status).toBe(200)

  await addStock(db, { productId: barilla.product.id, locationId: pantry, quantity: 1, expiresOn: '2026-11-15' })
  expect(lotRow(db, barilla.product.id, '2026-11-15').quantity).toBe(3)

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-a', name: 'Alex' })
  const stale = await patchLot(db, nov.id, {
    expected: { quantity: 2, locationId: pantry, expiresOn: '2026-11-15' },
    quantity: 1,
    locationId: pantry,
    expiresOn: '2026-11-15',
  })
  expect(stale.status).toBe(409)
  await expect(stale.json()).resolves.toEqual({ error: 'INVENTORY_CHANGED', code: 'INVENTORY_CHANGED' })
  expect(lotRow(db, barilla.product.id, '2026-11-15').quantity).toBe(3)
  expect(db.prepare('SELECT COUNT(*) AS n FROM inventory_history WHERE action = ?').get('adjust')).toEqual({ n: 0 })
})

test('Barilla multi-expiry local E2E: add, plus, edit, persist, FEFO consume', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')
  const pantry = await locationId(db, 'Cămară')
  const barilla = await createProduct(db, 'Barilla Penne', 'package', 'Barilla')

  await addStock(db, { productId: barilla.product.id, locationId: pantry, quantity: 2, expiresOn: '2026-11-15' })
  await addStock(db, { productId: barilla.product.id, locationId: pantry, quantity: 3, expiresOn: '2027-01-20' })
  await addStock(db, { productId: barilla.product.id, locationId: pantry, quantity: 1, expiresOn: null })

  let listed = await (await app.request('/api/v1/inventory', {}, envWithDb(db))).json()
  expect(listed.items[0].lots).toHaveLength(3)
  expect(listed.items[0].totalQuantity).toBe(6)

  await addStock(db, { productId: barilla.product.id, locationId: pantry, quantity: 1, expiresOn: '2026-11-15' })
  expect(lotRow(db, barilla.product.id, '2026-11-15').quantity).toBe(3)
  listed = await (await app.request('/api/v1/inventory', {}, envWithDb(db))).json()
  expect(listed.items[0].totalQuantity).toBe(7)

  const none = lotRow(db, barilla.product.id, null)
  await patchLot(db, none.id, {
    expected: { quantity: 1, locationId: pantry, expiresOn: null },
    quantity: 1,
    locationId: pantry,
    expiresOn: '2027-05-01',
  })

  const jan = lotRow(db, barilla.product.id, '2027-01-20')
  await patchLot(db, jan.id, {
    expected: { quantity: 3, locationId: pantry, expiresOn: '2027-01-20' },
    quantity: 2,
    locationId: pantry,
    expiresOn: '2027-01-20',
  })

  listed = await (await app.request('/api/v1/inventory', {}, envWithDb(db))).json()
  expect(listed.items[0].totalQuantity).toBe(6)
  expect(
    listed.items[0].lots.map((lot: { quantity: number; expiresOn: string | null }) => [lot.quantity, lot.expiresOn]),
  ).toEqual([
    [3, '2026-11-15'],
    [2, '2027-01-20'],
    [1, '2027-05-01'],
  ])

  const consume = await app.request(
    '/api/v1/inventory/consume',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: barilla.product.id, quantity: 3 }),
    },
    envWithDb(db),
  )
  expect(consume.status).toBe(200)
  expect(db.prepare('SELECT COUNT(*) AS n FROM inventory_lots WHERE expires_on = ?').get('2026-11-15')).toEqual({
    n: 0,
  })
  expect(lotRow(db, barilla.product.id, '2027-01-20').quantity).toBe(2)
  expect(lotRow(db, barilla.product.id, '2027-05-01').quantity).toBe(1)
})

test('household-local unit override migrates lots without changing the global product', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-a', 'Alex', 'alex@example.invalid')
  insertUser(db, 'user-b', 'Maria', 'maria@example.invalid')
  insertProfile(db, 'user-a', 'Alex')
  insertProfile(db, 'user-b', 'Maria')
  await createHousehold(db, 'user-a', 'Casa A')
  await createHousehold(db, 'user-b', 'Casa B')

  db.prepare(
    `INSERT INTO products (
       id, household_id, barcode, name, normalized_name, brand, default_unit, source, created_at, updated_at
     ) VALUES (
       'off-noodles', NULL, '8076809513388', 'Noodles', 'noodles', 'Barilla', 'g', 'open_food_facts', datetime('now'), datetime('now')
     )`,
  ).run()

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-a', name: 'Alex' })
  const pantry = await locationId(db, 'Cămară')
  await addStock(db, { productId: 'off-noodles', locationId: pantry, quantity: 3, expiresOn: '2026-11-15' })
  const lotId = lotRow(db, 'off-noodles', '2026-11-15').id

  const overridden = await app.request(
    '/api/v1/products/off-noodles/local-override',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        unit: 'package',
        lots: [{ lotId, quantity: 1 }],
      }),
    },
    envWithDb(db),
  )
  expect(overridden.status).toBe(200)
  const body = await overridden.json()
  expect(body.item.product.unit).toBe('package')
  expect(body.item.product.id).not.toBe('off-noodles')
  expect(body.item.lots).toEqual([
    expect.objectContaining({ quantity: 1, expiresOn: '2026-11-15', locationId: pantry }),
  ])

  const global = db
    .prepare(`SELECT default_unit AS unit, household_id AS householdId FROM products WHERE id = 'off-noodles'`)
    .get() as { unit: string; householdId: string | null }
  expect(global).toEqual({ unit: 'g', householdId: null })

  const lookupA = await app.request('/api/v1/barcodes/8076809513388', {}, envWithDb(db))
  const lookedA = await lookupA.json()
  expect(lookedA.status).toBe('existing')
  expect(lookedA.product.id).toBe(body.item.product.id)
  expect(lookedA.product.unit).toBe('package')

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-b', name: 'Maria' })
  const lookupB = await app.request('/api/v1/barcodes/8076809513388', {}, envWithDb(db))
  const lookedB = await lookupB.json()
  expect(lookedB.status).toBe('existing')
  expect(lookedB.product.id).toBe('off-noodles')
  expect(lookedB.product.unit).toBe('g')

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-a', name: 'Alex' })
  const reused = await app.request(
    '/api/v1/products/off-noodles/local-override',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ unit: 'package', lots: [] }),
    },
    envWithDb(db),
  )
  expect(reused.status).toBe(200)
  const reusedBody = await reused.json()
  expect(reusedBody.product.id).toBe(body.item.product.id)
  expect(
    db.prepare(`SELECT COUNT(*) AS n FROM products WHERE barcode = ? AND household_id IS NOT NULL`).get('8076809513388'),
  ).toEqual({ n: 1 })
})
