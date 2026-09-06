import { DatabaseSync } from 'node:sqlite'
import { expect, test } from 'vitest'
import { applyPantryMigrations, insertProfile, insertUser, sqliteAsD1 } from './sqlite-as-d1.js'
import { createD1HouseholdStore } from './household-store.js'
import { createD1ProductStore } from './product-store.js'
import { createD1InventoryStore } from './inventory-store.js'
import { createD1RecipeStore } from './recipe-store.js'
import type { GeneratedRecipe } from '@pantry/core'

function openStores() {
  const sqlite = new DatabaseSync(':memory:')
  applyPantryMigrations(sqlite)
  const db = sqliteAsD1(sqlite)
  return {
    sqlite,
    households: createD1HouseholdStore(db),
    products: createD1ProductStore(db),
    inventory: createD1InventoryStore(db),
    recipes: createD1RecipeStore(db),
  }
}

async function seed(userId = 'user-1') {
  const ctx = openStores()
  insertUser(ctx.sqlite, userId, userId, `${userId}@example.invalid`)
  insertProfile(ctx.sqlite, userId, userId)
  const created = await ctx.households.createHouseholdWithOwnerAndLocations({
    userId,
    name: 'Casa A',
    ownerDisplayName: userId,
  })
  const fridge = created.locations.find((location) => location.name === 'Frigider')
  if (!fridge) {
    throw new Error('missing Frigider')
  }

  return { ...ctx, householdId: created.household.id, fridgeId: fridge.id, userId }
}

function recipeFixture(ingredients: GeneratedRecipe['ingredients']): GeneratedRecipe {
  return {
    title: 'Omletă cu brânză',
    description: 'Test',
    servings: 2,
    timeMinutes: 15,
    ingredients,
    instructions: ['Amestecă', 'Gătește'],
    notes: null,
    nutrition: {
      complete: false,
      calculableIngredients: 0,
      totalIngredients: ingredients.length,
      total: { energyKcal: null, proteinG: null, carbohydratesG: null, fatG: null },
      perServing: { energyKcal: null, proteinG: null, carbohydratesG: null, fatG: null },
    },
    constraintVerification: 'incomplete',
  }
}

test('persists generated recipes and lists them newest first for the household', async () => {
  const ctx = await seed()
  const eggs = await ctx.products.createManualProduct({
    householdId: ctx.householdId,
    name: 'Ouă',
    unit: 'each',
  })
  const first = await ctx.recipes.createGeneratedRecipe({
    householdId: ctx.householdId,
    userId: ctx.userId,
    aiModel: '@cf/meta/llama-4-scout-17b-16e-instruct',
    recipe: recipeFixture([{ productId: eggs.id, name: 'Ouă', quantity: 4, unit: 'each' }]),
  })
  const second = await ctx.recipes.createGeneratedRecipe({
    householdId: ctx.householdId,
    userId: ctx.userId,
    aiModel: '@cf/meta/llama-4-scout-17b-16e-instruct',
    recipe: {
      ...recipeFixture([{ productId: eggs.id, name: 'Ouă', quantity: 2, unit: 'each' }]),
      title: 'Omletă simplă',
    },
  })

  const listed = await ctx.recipes.listRecentRecipes({ householdId: ctx.householdId })
  expect(listed.map((entry) => entry.id)).toEqual([second.id, first.id])
  const loaded = await ctx.recipes.getRecipe({ householdId: ctx.householdId, recipeId: first.id })
  expect(loaded?.ingredients[0]).toMatchObject({ name: 'Ouă', quantity: 4, unit: 'each' })
  expect(
    await ctx.recipes.getRecipe({ householdId: 'missing', recipeId: first.id }),
  ).toBeNull()
})

test('rate-limits 10 generation reservations per user per hour and isolates users', async () => {
  const ctx = await seed()
  insertUser(ctx.sqlite, 'user-2', 'user-2', 'user-2@example.invalid')
  insertProfile(ctx.sqlite, 'user-2', 'user-2')
  const now = new Date('2026-09-06T14:10:00.000Z')

  const results = []
  for (let i = 0; i < 11; i += 1) {
    results.push(await ctx.recipes.reserveAiGeneration({ userId: ctx.userId, now }))
  }

  expect(results.filter((result) => result.ok)).toHaveLength(10)
  expect(results[10]).toMatchObject({ ok: false, retryAfter: expect.any(Number) })

  const other = await ctx.recipes.reserveAiGeneration({ userId: 'user-2', now })
  expect(other.ok).toBe(true)

  const nextHour = await ctx.recipes.reserveAiGeneration({
    userId: ctx.userId,
    now: new Date('2026-09-06T15:00:00.000Z'),
  })
  expect(nextHour.ok).toBe(true)
})

test('concurrent reservations cannot exceed 10 in one window', async () => {
  const ctx = await seed()
  const now = new Date('2026-09-06T14:10:00.000Z')
  const results = await Promise.all(
    Array.from({ length: 12 }, () => ctx.recipes.reserveAiGeneration({ userId: ctx.userId, now })),
  )
  expect(results.filter((result) => result.ok)).toHaveLength(10)
  expect(results.filter((result) => !result.ok)).toHaveLength(2)
})

test('cook is all-or-nothing when one ingredient has insufficient stock', async () => {
  const ctx = await seed()
  const eggs = await ctx.products.createManualProduct({
    householdId: ctx.householdId,
    name: 'Ouă',
    unit: 'each',
  })
  const cheese = await ctx.products.createManualProduct({
    householdId: ctx.householdId,
    name: 'Brânză',
    unit: 'g',
  })
  await ctx.inventory.addStock({
    householdId: ctx.householdId,
    userId: ctx.userId,
    productId: eggs.id,
    locationId: ctx.fridgeId,
    quantity: 2,
  })
  await ctx.inventory.addStock({
    householdId: ctx.householdId,
    userId: ctx.userId,
    productId: cheese.id,
    locationId: ctx.fridgeId,
    quantity: 50,
  })
  const saved = await ctx.recipes.createGeneratedRecipe({
    householdId: ctx.householdId,
    userId: ctx.userId,
    aiModel: 'test',
    recipe: recipeFixture([
      { productId: eggs.id, name: 'Ouă', quantity: 2, unit: 'each' },
      { productId: cheese.id, name: 'Brânză', quantity: 100, unit: 'g' },
    ]),
  })

  await expect(
    ctx.recipes.cookRecipe({
      householdId: ctx.householdId,
      userId: ctx.userId,
      recipeId: saved.id,
    }),
  ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' })

  expect(ctx.sqlite.prepare('SELECT quantity FROM inventory_lots WHERE product_id = ?').get(eggs.id)).toEqual({
    quantity: 2,
  })
  expect(ctx.sqlite.prepare('SELECT quantity FROM inventory_lots WHERE product_id = ?').get(cheese.id)).toEqual({
    quantity: 50,
  })
  expect(ctx.sqlite.prepare('SELECT COUNT(*) AS n FROM inventory_history WHERE action = ?').get('consume')).toEqual({
    n: 0,
  })
  expect(ctx.sqlite.prepare('SELECT COUNT(*) AS n FROM recipe_cooks').get()).toEqual({ n: 0 })
})

test('concurrent cook of the same recipe allows one success and one conflict', async () => {
  const ctx = await seed()
  const eggs = await ctx.products.createManualProduct({
    householdId: ctx.householdId,
    name: 'Ouă',
    unit: 'each',
  })
  const cheese = await ctx.products.createManualProduct({
    householdId: ctx.householdId,
    name: 'Brânză',
    unit: 'g',
  })
  await ctx.inventory.addStock({
    householdId: ctx.householdId,
    userId: ctx.userId,
    productId: eggs.id,
    locationId: ctx.fridgeId,
    quantity: 4,
  })
  await ctx.inventory.addStock({
    householdId: ctx.householdId,
    userId: ctx.userId,
    productId: cheese.id,
    locationId: ctx.fridgeId,
    quantity: 200,
  })
  const saved = await ctx.recipes.createGeneratedRecipe({
    householdId: ctx.householdId,
    userId: ctx.userId,
    aiModel: 'test',
    recipe: recipeFixture([
      { productId: eggs.id, name: 'Ouă', quantity: 4, unit: 'each' },
      { productId: cheese.id, name: 'Brânză', quantity: 200, unit: 'g' },
    ]),
  })

  const cook = () =>
    ctx.recipes.cookRecipe({
      householdId: ctx.householdId,
      userId: ctx.userId,
      recipeId: saved.id,
    })
  const results = await Promise.allSettled([cook(), cook()])
  const fulfilled = results.filter((result) => result.status === 'fulfilled')
  const rejected = results.filter((result) => result.status === 'rejected')
  expect(fulfilled).toHaveLength(1)
  expect(rejected).toHaveLength(1)
  expect(rejected[0]?.status === 'rejected' && rejected[0].reason).toMatchObject({
    code: expect.stringMatching(/INSUFFICIENT_STOCK|STOCK_CONFLICT/),
  })

  expect(ctx.sqlite.prepare('SELECT COUNT(*) AS n FROM inventory_lots').get()).toEqual({ n: 0 })
  expect(ctx.sqlite.prepare('SELECT COUNT(*) AS n FROM recipe_cooks').get()).toEqual({ n: 1 })
  expect(ctx.sqlite.prepare('SELECT COUNT(*) AS n FROM inventory_history WHERE action = ?').get('consume')).toEqual({
    n: 2,
  })
  expect(ctx.sqlite.prepare('SELECT MIN(quantity) AS q FROM inventory_lots').get()).toEqual({ q: null })
})
