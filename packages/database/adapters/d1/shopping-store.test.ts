import { DatabaseSync } from 'node:sqlite'
import { expect, test } from 'vitest'
import { DomainError } from '@pantry/core'
import { applyPantryMigrations, insertProfile, insertUser, sqliteAsD1 } from './sqlite-as-d1.js'
import { createD1HouseholdStore } from './household-store.js'
import { createD1ProductStore } from './product-store.js'
import { createD1InventoryStore } from './inventory-store.js'
import { createD1ShoppingStore } from './shopping-store.js'

function openShopping() {
  const sqlite = new DatabaseSync(':memory:')
  applyPantryMigrations(sqlite)
  const db = sqliteAsD1(sqlite)
  return {
    sqlite,
    households: createD1HouseholdStore(db),
    products: createD1ProductStore(db),
    inventory: createD1InventoryStore(db),
    shopping: createD1ShoppingStore(db),
  }
}

async function seedHousehold(name = 'Casa A', userId = 'user-1') {
  const ctx = openShopping()
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

test('concurrent getOrCreateActiveList creates one active list', async () => {
  const ctx = await seedHousehold()

  const [first, second] = await Promise.all([
    ctx.shopping.getOrCreateActiveList({ householdId: ctx.householdId }),
    ctx.shopping.getOrCreateActiveList({ householdId: ctx.householdId }),
  ])

  expect(first.id).toBe(second.id)
  expect(ctx.sqlite.prepare('SELECT COUNT(*) AS n FROM shopping_lists').get()).toEqual({ n: 1 })
  expect(
    ctx.sqlite.prepare(`SELECT COUNT(*) AS n FROM shopping_lists WHERE status = 'active'`).get(),
  ).toEqual({ n: 1 })
})

test('concurrent product adds merge into one unchecked item with quantity 3', async () => {
  const ctx = await seedHousehold()
  const product = await ctx.products.createManualProduct({
    householdId: ctx.householdId,
    name: 'Lapte',
    unit: 'package',
  })
  await ctx.shopping.addProductItem({
    householdId: ctx.householdId,
    userId: ctx.userId,
    productId: product.id,
    quantity: 1,
    unit: 'package',
  })

  const add = () =>
    ctx.shopping.addProductItem({
      householdId: ctx.householdId,
      userId: ctx.userId,
      productId: product.id,
      quantity: 1,
      unit: 'package',
    })

  const [first, second] = await Promise.all([add(), add()])
  expect(first.id).toBe(second.id)
  expect(
    ctx.sqlite
      .prepare(`SELECT COUNT(*) AS n, SUM(quantity) AS qty FROM shopping_items WHERE is_checked = 0`)
      .get(),
  ).toEqual({ n: 1, qty: 3 })
  const listed = await ctx.shopping.getOrCreateActiveList({ householdId: ctx.householdId })
  expect(listed.items).toHaveLength(1)
  expect(listed.items[0]?.quantity).toBe(3)
})

test('checking a shopping item does not change inventory lots or history', async () => {
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
    quantity: 10,
  })
  const item = await ctx.shopping.addProductItem({
    householdId: ctx.householdId,
    userId: ctx.userId,
    productId: product.id,
    quantity: 2,
    unit: 'each',
  })

  const toggled = await ctx.shopping.toggleItem({
    householdId: ctx.householdId,
    itemId: item.id,
    checked: true,
  })

  expect(toggled.checked).toBe(true)
  expect(ctx.sqlite.prepare('SELECT quantity FROM inventory_lots').get()).toEqual({ quantity: 10 })
  expect(ctx.sqlite.prepare('SELECT COUNT(*) AS n FROM inventory_history').get()).toEqual({ n: 1 })
  expect(ctx.sqlite.prepare('SELECT action FROM inventory_history').get()).toEqual({ action: 'add' })
})

test('tenancy: household A cannot read or mutate household B shopping items', async () => {
  const ctxA = await seedHousehold('Casa A', 'user-a')
  insertUser(ctxA.sqlite, 'user-b', 'user-b', 'user-b@example.invalid')
  insertProfile(ctxA.sqlite, 'user-b', 'user-b')
  const householdB = await ctxA.households.createHouseholdWithOwnerAndLocations({
    userId: 'user-b',
    name: 'Casa B',
    ownerDisplayName: 'user-b',
  })

  const productB = await ctxA.products.createManualProduct({
    householdId: householdB.household.id,
    name: 'Secret B',
    unit: 'package',
  })
  const listB = await ctxA.shopping.addProductItem({
    householdId: householdB.household.id,
    userId: 'user-b',
    productId: productB.id,
    quantity: 1,
    unit: 'package',
  })

  const listA = await ctxA.shopping.getOrCreateActiveList({ householdId: ctxA.householdId })
  expect(listA.items).toEqual([])

  await expect(
    ctxA.shopping.toggleItem({ householdId: ctxA.householdId, itemId: listB.id, checked: true }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  await expect(
    ctxA.shopping.removeItem({ householdId: ctxA.householdId, itemId: listB.id }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  await expect(
    ctxA.shopping.addProductItem({
      householdId: ctxA.householdId,
      userId: ctxA.userId,
      productId: productB.id,
      quantity: 1,
      unit: 'package',
    }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' })
})

test('mismatched units reject product merge without guessing', async () => {
  const ctx = await seedHousehold()
  const product = await ctx.products.createManualProduct({
    householdId: ctx.householdId,
    name: 'Lapte',
    unit: 'package',
  })
  await ctx.shopping.addProductItem({
    householdId: ctx.householdId,
    userId: ctx.userId,
    productId: product.id,
    quantity: 1,
    unit: 'package',
  })

  await expect(
    ctx.shopping.addProductItem({
      householdId: ctx.householdId,
      userId: ctx.userId,
      productId: product.id,
      quantity: 500,
      unit: 'g',
    }),
  ).rejects.toBeInstanceOf(DomainError)
  await expect(
    ctx.shopping.addProductItem({
      householdId: ctx.householdId,
      userId: ctx.userId,
      productId: product.id,
      quantity: 500,
      unit: 'g',
    }),
  ).rejects.toMatchObject({ code: 'SHOPPING_UNIT_CONFLICT' })

  expect(ctx.sqlite.prepare('SELECT COUNT(*) AS n FROM shopping_items').get()).toEqual({ n: 1 })
  expect(ctx.sqlite.prepare('SELECT quantity, unit FROM shopping_items').get()).toEqual({
    quantity: 1,
    unit: 'package',
  })
})
