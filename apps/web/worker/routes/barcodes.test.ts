import { beforeEach, expect, test, vi } from 'vitest'

vi.mock('../auth/session.js', () => ({
  resolveCurrentUser: vi.fn(),
}))

vi.mock('../catalog/open-facts.js', () => ({
  lookupOpenFactsProduct: vi.fn(),
}))

import { resolveCurrentUser } from '../auth/session.js'
import { lookupOpenFactsProduct } from '../catalog/open-facts.js'
import { app } from '../index'
import { envWithDb, insertProfile, insertUser, openPantryDb } from '../test/sqlite-d1'

const resolveCurrentUserMock = vi.mocked(resolveCurrentUser)
const lookupMock = vi.mocked(lookupOpenFactsProduct)

beforeEach(() => {
  resolveCurrentUserMock.mockReset()
  resolveCurrentUserMock.mockResolvedValue(null)
  lookupMock.mockReset()
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

test('barcode lookup requires auth and an active household', async () => {
  const db = openPantryDb()
  const env = envWithDb(db)

  expect((await app.request('/api/v1/barcodes/3017620422003', {}, env)).status).toBe(401)

  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  resolveCurrentUserMock.mockResolvedValue({ id: 'user-1', name: 'Alex' })
  const setupRequired = await app.request('/api/v1/barcodes/3017620422003', {}, env)
  expect(setupRequired.status).toBe(409)
})

test('GET lookup is read-only and returns external preview without creating a product', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')

  lookupMock.mockResolvedValue({
    status: 'found',
    product: {
      barcode: '3017620422003',
      catalog: 'open_food_facts',
      productType: 'food',
      name: 'Nutella',
      brand: 'Ferrero',
      imageUrl: 'https://images.openfoodfacts.org/images/products/front.jpg',
      quantityText: '400 g',
      packageQuantity: 400,
      packageUnit: 'g',
      packageQuantityConfident: true,
      unit: 'g',
      nutrition: {
        energyKcal100g: 539,
        proteinG100g: 6.3,
        carbohydratesG100g: 57.5,
        fatG100g: 30.9,
        sugarsG100g: null,
        fiberG100g: null,
        saltG100g: null,
        servingSize: null,
        energyKcalServing: null,
        proteinGServing: null,
        carbohydratesGServing: null,
        fatGServing: null,
      },
    },
  })

  const res = await app.request('/api/v1/barcodes/3017620422003', {}, envWithDb(db))
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.status).toBe('external')
  expect(body.product.name).toBe('Nutella')
  expect(body.product.nutrition.energyKcal100g).toBe(539)
  expect(db.prepare('SELECT COUNT(*) AS n FROM products').get()).toEqual({ n: 0 })
  expect(lookupMock).toHaveBeenCalledTimes(1)
})

test('GET lookup prefers the current household private barcode over a global product', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-a', 'A', 'a@example.invalid')
  insertUser(db, 'user-b', 'B', 'b@example.invalid')
  insertProfile(db, 'user-a', 'A')
  insertProfile(db, 'user-b', 'B')
  await createHousehold(db, 'user-a', 'Casa A')
  await createHousehold(db, 'user-b', 'Casa B')

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-b', name: 'B' })
  const created = await app.request(
    '/api/v1/products',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Private B', unit: 'g', barcode: '3017620422003' }),
    },
    envWithDb(db),
  )
  expect(created.status).toBe(201)

  lookupMock.mockResolvedValue({
    status: 'found',
    product: {
      barcode: '3017620422003',
      catalog: 'open_food_facts',
      productType: 'food',
      name: 'Nutella',
      brand: 'Ferrero',
      imageUrl: null,
      quantityText: null,
      packageQuantity: null,
      packageUnit: null,
      packageQuantityConfident: false,
      unit: 'package',
      nutrition: null,
    },
  })

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-a', name: 'A' })
  const imported = await app.request(
    '/api/v1/barcodes/3017620422003/import',
    { method: 'POST' },
    envWithDb(db),
  )
  expect(imported.status).toBe(201)

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-b', name: 'B' })
  const lookupB = await app.request('/api/v1/barcodes/3017620422003', {}, envWithDb(db))
  const bodyB = await lookupB.json()
  expect(bodyB.status).toBe('existing')
  expect(bodyB.product.name).toBe('Private B')
  expect(bodyB.product.source).toBe('manual')

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-a', name: 'A' })
  const lookupA = await app.request('/api/v1/barcodes/3017620422003', {}, envWithDb(db))
  const bodyA = await lookupA.json()
  expect(bodyA.status).toBe('existing')
  expect(bodyA.product.name).toBe('Nutella')
})

test('provider failure is 503 and not_found is distinct', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')

  lookupMock.mockResolvedValue({ status: 'temporary_failure' })
  const unavailable = await app.request('/api/v1/barcodes/3017620422003', {}, envWithDb(db))
  expect(unavailable.status).toBe(503)
  expect(await unavailable.json()).toMatchObject({ code: 'CATALOG_UNAVAILABLE' })
  expect(db.prepare('SELECT COUNT(*) AS n FROM products').get()).toEqual({ n: 0 })

  lookupMock.mockResolvedValue({ status: 'not_found' })
  const missing = await app.request('/api/v1/barcodes/0000000000000', {}, envWithDb(db))
  expect(missing.status).toBe(200)
  expect(await missing.json()).toEqual({ status: 'not_found', barcode: '0000000000000' })
})

test('import creates one global product for concurrent callers', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertUser(db, 'user-2', 'Bo', 'bo@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  insertProfile(db, 'user-2', 'Bo')
  await createHousehold(db, 'user-1', 'Casa 1')
  await createHousehold(db, 'user-2', 'Casa 2')

  lookupMock.mockResolvedValue({
    status: 'found',
    product: {
      barcode: '3017620422003',
      catalog: 'open_food_facts',
      productType: 'food',
      name: 'Nutella',
      brand: 'Ferrero',
      imageUrl: 'https://images.openfoodfacts.org/images/products/front.jpg',
      quantityText: '400 g',
      packageQuantity: 400,
      packageUnit: 'g',
      packageQuantityConfident: true,
      unit: 'g',
      nutrition: {
        energyKcal100g: 539,
        proteinG100g: 6.3,
        carbohydratesG100g: 57.5,
        fatG100g: 30.9,
        sugarsG100g: null,
        fiberG100g: null,
        saltG100g: null,
        servingSize: null,
        energyKcalServing: null,
        proteinGServing: null,
        carbohydratesGServing: null,
        fatGServing: null,
      },
    },
  })

  const env = envWithDb(db)
  resolveCurrentUserMock.mockResolvedValue({ id: 'user-1', name: 'Alex' })
  const results = await Promise.all([
    app.request('/api/v1/barcodes/3017620422003/import', { method: 'POST' }, env),
    app.request('/api/v1/barcodes/3017620422003/import', { method: 'POST' }, env),
  ])
  expect(results.map((res) => res.status).every((status) => status === 201 || status === 200)).toBe(true)
  const bodies = await Promise.all(results.map((res) => res.json()))
  expect(bodies[0].product.id).toBe(bodies[1].product.id)

  expect(
    db.prepare('SELECT COUNT(*) AS n FROM products WHERE barcode = ? AND household_id IS NULL').get('3017620422003'),
  ).toEqual({ n: 1 })
  expect(db.prepare('SELECT COUNT(*) AS n FROM product_nutrition').get()).toEqual({ n: 1 })
  expect(db.prepare('SELECT energy_kcal_100g AS kcal FROM product_nutrition').get()).toEqual({ kcal: 539 })
})

test('unknown barcode can be saved as a household-private manual product', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')

  const created = await app.request(
    '/api/v1/products',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Cafea de specialitate', unit: 'g', barcode: '01234565' }),
    },
    envWithDb(db),
  )
  expect(created.status).toBe(201)
  const body = await created.json()
  expect(body.product.barcode).toBe('01234565')

  const row = db
    .prepare('SELECT household_id IS NOT NULL AS private, source, barcode FROM products WHERE id = ?')
    .get(body.product.id) as { private: number; source: string; barcode: string }
  expect(row.private).toBe(1)
  expect(row.source).toBe('manual')
  expect(row.barcode).toBe('01234565')

  lookupMock.mockResolvedValue({ status: 'not_found' })
  const lookup = await app.request('/api/v1/barcodes/01234565', {}, envWithDb(db))
  const looked = await lookup.json()
  expect(looked.status).toBe('existing')
  expect(looked.product.id).toBe(body.product.id)
  expect(lookupMock).not.toHaveBeenCalled()
})

test('rejects non-digit barcodes without Number conversion', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')

  const res = await app.request('/api/v1/barcodes/not-a-code', {}, envWithDb(db))
  expect(res.status).toBe(400)
  expect(await res.json()).toMatchObject({ code: 'INVALID_BARCODE' })
  expect(lookupMock).not.toHaveBeenCalled()
})

test('imported barcode can be stocked and a second lookup stays on the same global product', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')
  const env = envWithDb(db)
  const locations = (await (await app.request('/api/v1/locations', {}, env)).json()) as {
    locations: Array<{ id: string; name: string }>
  }
  const fridge = locations.locations.find((location) => location.name === 'Frigider')
  if (!fridge) {
    throw new Error('missing Frigider')
  }

  lookupMock.mockResolvedValue({
    status: 'found',
    product: {
      barcode: '3017620422003',
      catalog: 'open_food_facts',
      productType: 'food',
      name: 'Nutella',
      brand: 'Ferrero',
      imageUrl: 'https://images.openfoodfacts.org/images/products/front.jpg',
      quantityText: '400 g',
      packageQuantity: 400,
      packageUnit: 'g',
      packageQuantityConfident: true,
      unit: 'g',
      nutrition: {
        energyKcal100g: 539,
        proteinG100g: 6.3,
        carbohydratesG100g: 57.5,
        fatG100g: 30.9,
        sugarsG100g: null,
        fiberG100g: null,
        saltG100g: null,
        servingSize: null,
        energyKcalServing: null,
        proteinGServing: null,
        carbohydratesGServing: null,
        fatGServing: null,
      },
    },
  })

  const imported = await app.request('/api/v1/barcodes/3017620422003/import', { method: 'POST' }, env)
  const importedBody = await imported.json()
  const productId = importedBody.product.id as string

  await app.request(
    '/api/v1/inventory/stock',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId, locationId: fridge.id, quantity: 400, expiresOn: null }),
    },
    env,
  )

  lookupMock.mockClear()
  const secondLookup = await app.request('/api/v1/barcodes/3017620422003', {}, env)
  const secondBody = await secondLookup.json()
  expect(secondBody.status).toBe('existing')
  expect(secondBody.product.id).toBe(productId)
  expect(lookupMock).not.toHaveBeenCalled()

  await app.request(
    '/api/v1/inventory/stock',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId, locationId: fridge.id, quantity: 400, expiresOn: null }),
    },
    env,
  )

  const inventory = await (await app.request('/api/v1/inventory', {}, env)).json()
  expect(inventory.items).toHaveLength(1)
  expect(inventory.items[0].totalQuantity).toBe(800)
  expect(inventory.items[0].product.nutrition.energyKcal100g).toBe(539)
  expect(db.prepare('SELECT COUNT(*) AS n FROM products WHERE barcode = ?').get('3017620422003')).toEqual({ n: 1 })
  expect(db.prepare('SELECT COUNT(*) AS n FROM inventory_lots').get()).toEqual({ n: 1 })
  expect(db.prepare('SELECT COUNT(*) AS n FROM inventory_history').get()).toEqual({ n: 2 })
})
