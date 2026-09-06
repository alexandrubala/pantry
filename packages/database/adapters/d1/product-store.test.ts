import { DatabaseSync } from 'node:sqlite'
import { expect, test } from 'vitest'
import { applyPantryMigrations, insertProfile, insertUser, sqliteAsD1 } from './sqlite-as-d1.js'
import { createD1HouseholdStore } from './household-store.js'
import { createD1ProductStore } from './product-store.js'

function openProducts() {
  const sqlite = new DatabaseSync(':memory:')
  applyPantryMigrations(sqlite)
  const db = sqliteAsD1(sqlite)
  return {
    sqlite,
    households: createD1HouseholdStore(db),
    products: createD1ProductStore(db),
  }
}

async function seedHousehold(name = 'Casa A', userId = 'user-1') {
  const ctx = openProducts()
  insertUser(ctx.sqlite, userId, userId, `${userId}@example.invalid`)
  insertProfile(ctx.sqlite, userId, userId)
  const created = await ctx.households.createHouseholdWithOwnerAndLocations({
    userId,
    name,
    ownerDisplayName: userId,
  })
  return { ...ctx, householdId: created.household.id, userId }
}

const nutellaNutrition = {
  energyKcal100g: 539,
  proteinG100g: 6.3,
  carbohydratesG100g: 57.5,
  fatG100g: 30.9,
  sugarsG100g: 56.3,
  fiberG100g: null,
  saltG100g: 0.107,
  servingSize: '15 g',
  energyKcalServing: 81,
  proteinGServing: 0.9,
  carbohydratesGServing: 8.6,
  fatGServing: 4.6,
}

test('household private barcode wins over a global barcode', async () => {
  const ctx = await seedHousehold()
  insertUser(ctx.sqlite, 'user-2', 'Bo', 'bo@example.invalid')
  insertProfile(ctx.sqlite, 'user-2', 'Bo')
  const other = await ctx.households.createHouseholdWithOwnerAndLocations({
    userId: 'user-2',
    name: 'Casa B',
    ownerDisplayName: 'Bo',
  })

  await ctx.products.createManualProduct({
    householdId: ctx.householdId,
    name: 'Cafea mea',
    unit: 'g',
    barcode: '3017620422003',
  })
  const global = await ctx.products.importExternalProduct({
    barcode: '3017620422003',
    catalog: 'open_food_facts',
    productType: 'food',
    name: 'Nutella',
    brand: 'Ferrero',
    unit: 'g',
    imageUrl: null,
    packageQuantity: 400,
    packageUnit: 'g',
    nutrition: nutellaNutrition,
  })

  const forOwner = await ctx.products.findReadableByBarcode({
    householdId: ctx.householdId,
    barcode: '3017620422003',
  })
  const forOther = await ctx.products.findReadableByBarcode({
    householdId: other.household.id,
    barcode: '3017620422003',
  })

  expect(forOwner?.name).toBe('Cafea mea')
  expect(forOwner?.id).not.toBe(global.id)
  expect(forOther?.id).toBe(global.id)
  expect(forOther?.name).toBe('Nutella')
})

test('concurrent external imports create a single global product and nutrition row', async () => {
  const ctx = await seedHousehold()

  const importOnce = () =>
    ctx.products.importExternalProduct({
      barcode: '3017620422003',
      catalog: 'open_food_facts',
      productType: 'food',
      name: 'Nutella',
      brand: 'Ferrero',
      unit: 'g',
      imageUrl: 'https://images.openfoodfacts.org/images/products/front.jpg',
      packageQuantity: 400,
      packageUnit: 'g',
      nutrition: nutellaNutrition,
    })

  const [first, second] = await Promise.all([importOnce(), importOnce()])
  expect(first.id).toBe(second.id)
  expect(first.nutrition?.energyKcal100g).toBe(539)
  expect(second.nutrition?.energyKcal100g).toBe(539)
  expect(
    ctx.sqlite.prepare('SELECT COUNT(*) AS n FROM products WHERE barcode = ? AND household_id IS NULL').get('3017620422003'),
  ).toEqual({ n: 1 })
  expect(ctx.sqlite.prepare('SELECT COUNT(*) AS n FROM product_nutrition').get()).toEqual({ n: 1 })
  expect(ctx.sqlite.prepare('SELECT energy_kcal_100g AS kcal, protein_g_100g AS protein FROM product_nutrition').get()).toEqual({
    kcal: 539,
    protein: 6.3,
  })
})
