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

async function createProduct(db: ReturnType<typeof openPantryDb>, name: string, unit: string) {
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

function recipeFromInventory(productId: string, quantity = 2) {
  return {
    response: {
      title: 'Omletă',
      description: 'Din inventar',
      servings: 2,
      timeMinutes: 15,
      ingredients: [{ productId, quantity }],
      instructions: ['Bate ouăle', 'Gătește'],
      notes: null,
    },
  }
}

test('generate, recipe, and cook routes require auth', async () => {
  const env = envWithDb(openPantryDb())
  expect((await app.request('/api/v1/ai/recipes/generate', { method: 'POST', body: '{}' }, env)).status).toBe(401)
  expect((await app.request('/api/v1/recipes', {}, env)).status).toBe(401)
  expect((await app.request('/api/v1/recipes/r1', {}, env)).status).toBe(401)
  expect((await app.request('/api/v1/recipes/r1/cook', { method: 'POST' }, env)).status).toBe(401)
})

test('empty inventory returns 409 without calling the model', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')
  let called = 0
  const env = envWithDb(db, async () => {
    called += 1
    return recipeFromInventory('missing')
  })
  const res = await app.request(
    '/api/v1/ai/recipes/generate',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ servings: 2, mode: 'high_protein' }),
    },
    env,
  )
  expect(res.status).toBe(409)
  expect(await res.json()).toMatchObject({ error: 'EMPTY_INVENTORY', code: 'EMPTY_INVENTORY' })
  expect(called).toBe(0)
})

test('generates a recipe from inventory, persists it, and does not mutate stock', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')
  const locationId = await fridgeId(db)
  const product = await createProduct(db, 'Ouă', 'each')
  await app.request(
    '/api/v1/inventory/stock',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: product.product.id, locationId, quantity: 10, expiresOn: null }),
    },
    envWithDb(db),
  )

  db.prepare(
    `INSERT INTO product_nutrition (product_id, energy_kcal_100g, protein_g_100g, carbohydrates_g_100g, fat_g_100g, updated_at)
     VALUES (?, 143, 13, 1.1, 9.5, datetime('now'))`,
  ).run(product.product.id)

  const env = envWithDb(db, async () => recipeFromInventory(product.product.id, 4))
  const generated = await app.request(
    '/api/v1/ai/recipes/generate',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        servings: 2,
        mode: 'high_protein',
        maxCaloriesPerServing: 600,
        minProteinPerServing: 40,
      }),
    },
    env,
  )
  expect(generated.status).toBe(200)
  const body = (await generated.json()) as {
    recipe: {
      id: string
      ingredients: Array<{ productId: string; quantity: number; unit: string; name: string }>
      nutrition: { complete: boolean }
    }
  }
  expect(body.recipe.ingredients).toEqual([
    { productId: product.product.id, name: 'Ouă', quantity: 4, unit: 'each' },
  ])
  expect(body.recipe.nutrition.complete).toBe(false)

  expect(db.prepare('SELECT quantity FROM inventory_lots').get()).toEqual({ quantity: 10 })
  expect(db.prepare('SELECT COUNT(*) AS n FROM recipe_cooks').get()).toEqual({ n: 0 })

  const listed = await app.request('/api/v1/recipes', {}, envWithDb(db))
  expect(listed.status).toBe(200)
  const listBody = (await listed.json()) as { recipes: Array<{ id: string }> }
  expect(listBody.recipes[0]?.id).toBe(body.recipe.id)

  const fetched = await app.request(`/api/v1/recipes/${body.recipe.id}`, {}, envWithDb(db))
  expect(fetched.status).toBe(200)
})

test('the 11th generation in one hour is rate limited', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')
  const locationId = await fridgeId(db)
  const product = await createProduct(db, 'Ouă', 'each')
  await app.request(
    '/api/v1/inventory/stock',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: product.product.id, locationId, quantity: 10, expiresOn: null }),
    },
    envWithDb(db),
  )

  const env = envWithDb(db, async () => recipeFromInventory(product.product.id, 1))
  for (let i = 0; i < 10; i += 1) {
    const res = await app.request(
      '/api/v1/ai/recipes/generate',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ servings: 1, mode: 'balanced' }),
      },
      env,
    )
    expect(res.status).toBe(200)
  }

  const limited = await app.request(
    '/api/v1/ai/recipes/generate',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ servings: 1, mode: 'balanced' }),
    },
    env,
  )
  expect(limited.status).toBe(429)
  expect(await limited.json()).toMatchObject({ error: 'AI_RATE_LIMIT', retryAfter: expect.any(Number) })
})

test('cook consumes every ingredient atomically and writes one cook row', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')
  const locationId = await fridgeId(db)
  const eggs = await createProduct(db, 'Ouă', 'each')
  const cheese = await createProduct(db, 'Brânză', 'g')
  await app.request(
    '/api/v1/inventory/stock',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: eggs.product.id, locationId, quantity: 4, expiresOn: null }),
    },
    envWithDb(db),
  )
  await app.request(
    '/api/v1/inventory/stock',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: cheese.product.id, locationId, quantity: 200, expiresOn: null }),
    },
    envWithDb(db),
  )

  const env = envWithDb(db, async () => ({
    response: {
      title: 'Omletă cu brânză',
      servings: 2,
      ingredients: [
        { productId: eggs.product.id, quantity: 4 },
        { productId: cheese.product.id, quantity: 200 },
      ],
      instructions: ['Gătește'],
    },
  }))
  const generated = await app.request(
    '/api/v1/ai/recipes/generate',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ servings: 2, mode: 'balanced' }),
    },
    env,
  )
  const body = (await generated.json()) as { recipe: { id: string } }

  const cooked = await app.request(`/api/v1/recipes/${body.recipe.id}/cook`, { method: 'POST' }, envWithDb(db))
  expect(cooked.status).toBe(200)
  expect(db.prepare('SELECT COUNT(*) AS n FROM inventory_lots').get()).toEqual({ n: 0 })
  expect(db.prepare('SELECT COUNT(*) AS n FROM recipe_cooks').get()).toEqual({ n: 1 })
  expect(db.prepare('SELECT COUNT(*) AS n FROM inventory_history WHERE action = ?').get('consume')).toEqual({ n: 2 })
})

test('recipe IDs from another household are not readable', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  insertUser(db, 'user-2', 'Dana', 'dana@example.invalid')
  insertProfile(db, 'user-2', 'Dana')
  await createHousehold(db, 'user-1', 'Casa A')
  const locationId = await fridgeId(db)
  const product = await createProduct(db, 'Ouă', 'each')
  await app.request(
    '/api/v1/inventory/stock',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: product.product.id, locationId, quantity: 4, expiresOn: null }),
    },
    envWithDb(db),
  )
  const env = envWithDb(db, async () => recipeFromInventory(product.product.id, 2))
  const generated = await app.request(
    '/api/v1/ai/recipes/generate',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ servings: 2, mode: 'balanced' }),
    },
    env,
  )
  const body = (await generated.json()) as { recipe: { id: string } }

  await createHousehold(db, 'user-2', 'Casa B')
  const other = await app.request(`/api/v1/recipes/${body.recipe.id}`, {}, envWithDb(db))
  expect(other.status).toBe(404)
})
