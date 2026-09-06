import { DatabaseSync } from 'node:sqlite'
import { expect, test } from 'vitest'
import { applyPantryMigrations, insertProfile, insertUser, sqliteAsD1 } from './sqlite-as-d1.js'
import { createD1HouseholdStore } from './household-store.js'
import { createD1ProductStore } from './product-store.js'
import { createD1InventoryStore } from './inventory-store.js'

function openInventory() {
  const sqlite = new DatabaseSync(':memory:')
  applyPantryMigrations(sqlite)
  const db = sqliteAsD1(sqlite)
  return {
    sqlite,
    households: createD1HouseholdStore(db),
    products: createD1ProductStore(db),
    inventory: createD1InventoryStore(db),
  }
}

async function seedHousehold(name = 'Casa A', userId = 'user-1') {
  const ctx = openInventory()
  insertUser(ctx.sqlite, userId, userId, `${userId}@example.invalid`)
  insertProfile(ctx.sqlite, userId, userId)
  const created = await ctx.households.createHouseholdWithOwnerAndLocations({
    userId,
    name,
    ownerDisplayName: userId,
  })
  const fridge = created.locations.find((location) => location.name === 'Frigider')
  if (!fridge) {
    throw new Error('missing Frigider')
  }

  return { ...ctx, householdId: created.household.id, fridgeId: fridge.id, userId }
}

test('add-stock upserts the same lot and records history', async () => {
  const ctx = await seedHousehold()
  const product = await ctx.products.createManualProduct({
    householdId: ctx.householdId,
    name: 'Lapte',
    brand: 'Pilos',
    unit: 'ml',
  })

  await ctx.inventory.addStock({
    householdId: ctx.householdId,
    userId: ctx.userId,
    productId: product.id,
    locationId: ctx.fridgeId,
    quantity: 1000,
    expiresOn: '2026-09-15',
  })
  const item = await ctx.inventory.addStock({
    householdId: ctx.householdId,
    userId: ctx.userId,
    productId: product.id,
    locationId: ctx.fridgeId,
    quantity: 500,
    expiresOn: '2026-09-15',
  })

  expect(item.totalQuantity).toBe(1500)
  expect(item.lots).toHaveLength(1)
  expect(item.lots[0]?.quantity).toBe(1500)
  expect(ctx.sqlite.prepare('SELECT COUNT(*) AS n FROM inventory_lots').get()).toEqual({ n: 1 })
  expect(ctx.sqlite.prepare('SELECT COUNT(*) AS n FROM inventory_history WHERE action = ?').get('add')).toEqual({
    n: 2,
  })
})

test('different expiry dates create distinct lots', async () => {
  const ctx = await seedHousehold()
  const product = await ctx.products.createManualProduct({
    householdId: ctx.householdId,
    name: 'Lapte',
    unit: 'ml',
  })

  await ctx.inventory.addStock({
    householdId: ctx.householdId,
    userId: ctx.userId,
    productId: product.id,
    locationId: ctx.fridgeId,
    quantity: 1000,
    expiresOn: '2026-09-10',
  })
  const item = await ctx.inventory.addStock({
    householdId: ctx.householdId,
    userId: ctx.userId,
    productId: product.id,
    locationId: ctx.fridgeId,
    quantity: 500,
    expiresOn: '2026-09-15',
  })

  expect(item.totalQuantity).toBe(1500)
  expect(item.lots).toHaveLength(2)
})

test('consume uses FEFO, removes empty lots, and writes history per lot', async () => {
  const ctx = await seedHousehold()
  const product = await ctx.products.createManualProduct({
    householdId: ctx.householdId,
    name: 'Lapte',
    unit: 'ml',
  })

  await ctx.inventory.addStock({
    householdId: ctx.householdId,
    userId: ctx.userId,
    productId: product.id,
    locationId: ctx.fridgeId,
    quantity: 500,
    expiresOn: '2026-09-08',
  })
  await ctx.inventory.addStock({
    householdId: ctx.householdId,
    userId: ctx.userId,
    productId: product.id,
    locationId: ctx.fridgeId,
    quantity: 700,
    expiresOn: '2026-09-10',
  })
  await ctx.inventory.addStock({
    householdId: ctx.householdId,
    userId: ctx.userId,
    productId: product.id,
    locationId: ctx.fridgeId,
    quantity: 1000,
    expiresOn: null,
  })

  const consumed = await ctx.inventory.consume({
    householdId: ctx.householdId,
    userId: ctx.userId,
    productId: product.id,
    quantity: 900,
  })

  expect(consumed.item?.totalQuantity).toBe(1300)
  expect(consumed.item?.lots).toHaveLength(2)
  expect(consumed.item?.lots.map((lot) => [lot.quantity, lot.expiresOn])).toEqual([
    [300, '2026-09-10'],
    [1000, null],
  ])
  expect(ctx.sqlite.prepare('SELECT COUNT(*) AS n FROM inventory_lots WHERE quantity <= 0').get()).toEqual({
    n: 0,
  })
  expect(
    ctx.sqlite.prepare('SELECT COUNT(*) AS n FROM inventory_history WHERE action = ?').get('consume'),
  ).toEqual({ n: 2 })
})

test('concurrent add-stock to the same lot yields quantity 2 and two history rows', async () => {
  const ctx = await seedHousehold()
  const product = await ctx.products.createManualProduct({
    householdId: ctx.householdId,
    name: 'Ouă',
    unit: 'each',
  })

  const add = () =>
    ctx.inventory.addStock({
      householdId: ctx.householdId,
      userId: ctx.userId,
      productId: product.id,
      locationId: ctx.fridgeId,
      quantity: 1,
      expiresOn: '2026-09-20',
    })

  await Promise.all([add(), add()])

  expect(ctx.sqlite.prepare('SELECT COUNT(*) AS n FROM inventory_lots').get()).toEqual({ n: 1 })
  expect(ctx.sqlite.prepare('SELECT quantity FROM inventory_lots').get()).toEqual({ quantity: 2 })
  expect(ctx.sqlite.prepare('SELECT COUNT(*) AS n FROM inventory_history WHERE action = ?').get('add')).toEqual({
    n: 2,
  })
})

test('concurrent consume of the last unit allows only one success', async () => {
  const ctx = await seedHousehold()
  const product = await ctx.products.createManualProduct({
    householdId: ctx.householdId,
    name: 'Ouă',
    unit: 'each',
  })
  await ctx.inventory.addStock({
    householdId: ctx.householdId,
    userId: ctx.userId,
    productId: product.id,
    locationId: ctx.fridgeId,
    quantity: 1,
  })

  const results = await Promise.allSettled([
    ctx.inventory.consume({
      householdId: ctx.householdId,
      userId: ctx.userId,
      productId: product.id,
      quantity: 1,
    }),
    ctx.inventory.consume({
      householdId: ctx.householdId,
      userId: ctx.userId,
      productId: product.id,
      quantity: 1,
    }),
  ])

  const fulfilled = results.filter((result) => result.status === 'fulfilled')
  const rejected = results.filter((result) => result.status === 'rejected')
  expect(fulfilled).toHaveLength(1)
  expect(rejected).toHaveLength(1)
  expect(rejected[0]?.status === 'rejected' && rejected[0].reason).toMatchObject({
    code: expect.stringMatching(/INSUFFICIENT_STOCK|STOCK_CONFLICT/),
  })

  expect(ctx.sqlite.prepare('SELECT COUNT(*) AS n FROM inventory_lots').get()).toEqual({ n: 0 })
  expect(
    ctx.sqlite.prepare('SELECT COUNT(*) AS n FROM inventory_history WHERE action = ?').get('consume'),
  ).toEqual({ n: 1 })
  expect(ctx.sqlite.prepare('SELECT MIN(quantity) AS q FROM inventory_lots').get()).toEqual({ q: null })
})

test('stale consumption plan aborts all writes', async () => {
  const ctx = await seedHousehold()
  const product = await ctx.products.createManualProduct({
    householdId: ctx.householdId,
    name: 'Ouă',
    unit: 'each',
  })
  await ctx.inventory.addStock({
    householdId: ctx.householdId,
    userId: ctx.userId,
    productId: product.id,
    locationId: ctx.fridgeId,
    quantity: 1,
  })

  await ctx.inventory.consume({
    householdId: ctx.householdId,
    userId: ctx.userId,
    productId: product.id,
    quantity: 1,
  })

  await expect(
    ctx.inventory.consume({
      householdId: ctx.householdId,
      userId: ctx.userId,
      productId: product.id,
      quantity: 1,
    }),
  ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' })

  expect(ctx.sqlite.prepare('SELECT COUNT(*) AS n FROM inventory_lots').get()).toEqual({ n: 0 })
  expect(
    ctx.sqlite.prepare('SELECT COUNT(*) AS n FROM inventory_history WHERE action = ?').get('consume'),
  ).toEqual({ n: 1 })
})
