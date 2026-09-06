import { expect, test } from 'vitest'
import { createD1HouseholdStore, createD1InventoryStore, createD1ProductStore } from '@pantry/database/d1'
import { insertProfile, insertUser, openPantryDb, sqliteAsD1 } from '../test/sqlite-d1.js'
import { createOpenFactsCatalog } from './open-facts.js'

const LIVE = process.env.RUN_LIVE_OFF === '1'

test.skipIf(!LIVE)('imports a live OFF barcode once, then adds stock without duplicating the global product', async () => {
  const sqlite = openPantryDb()
  const db = sqliteAsD1(sqlite)
  insertUser(sqlite, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(sqlite, 'user-1', 'Alex')
  const households = createD1HouseholdStore(db)
  const products = createD1ProductStore(db)
  const inventory = createD1InventoryStore(db)
  const created = await households.createHouseholdWithOwnerAndLocations({
    userId: 'user-1',
    name: 'Casa locală',
    ownerDisplayName: 'Alex',
  })
  const fridge = created.locations.find((location) => location.name === 'Frigider')
  if (!fridge) {
    throw new Error('missing Frigider')
  }

  const lookup = await createOpenFactsCatalog().lookupByBarcode('3017620422003')
  expect(lookup.status).toBe('found')
  if (lookup.status !== 'found') {
    return
  }

  expect(lookup.product.name).toMatch(/nutella/i)
  expect(lookup.product.nutrition?.energyKcal100g).toBe(539)

  const first = await products.importExternalProduct({
    barcode: lookup.product.barcode,
    catalog: lookup.product.catalog,
    productType: lookup.product.productType,
    name: lookup.product.name,
    brand: lookup.product.brand,
    unit: lookup.product.unit,
    imageUrl: lookup.product.imageUrl,
    packageQuantity: lookup.product.packageQuantity,
    packageUnit: lookup.product.packageUnit,
    nutrition: lookup.product.nutrition,
  })
  const second = await products.importExternalProduct({
    barcode: lookup.product.barcode,
    catalog: lookup.product.catalog,
    productType: lookup.product.productType,
    name: lookup.product.name,
    brand: lookup.product.brand,
    unit: lookup.product.unit,
    imageUrl: lookup.product.imageUrl,
    packageQuantity: lookup.product.packageQuantity,
    packageUnit: lookup.product.packageUnit,
    nutrition: lookup.product.nutrition,
  })

  expect(second.id).toBe(first.id)
  expect(first.nutrition?.energyKcal100g).toBe(539)
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM products WHERE barcode = ? AND household_id IS NULL').get('3017620422003')).toEqual({
    n: 1,
  })
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM product_nutrition').get()).toEqual({ n: 1 })

  await inventory.addStock({
    householdId: created.household.id,
    userId: 'user-1',
    productId: first.id,
    locationId: fridge.id,
    quantity: lookup.product.packageQuantity ?? 400,
    expiresOn: null,
  })
  const item = await inventory.addStock({
    householdId: created.household.id,
    userId: 'user-1',
    productId: first.id,
    locationId: fridge.id,
    quantity: lookup.product.packageQuantity ?? 400,
    expiresOn: null,
  })

  expect(item.totalQuantity).toBe((lookup.product.packageQuantity ?? 400) * 2)
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM inventory_lots').get()).toEqual({ n: 1 })
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM inventory_history').get()).toEqual({ n: 2 })
  expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])

  sqlite.exec('DELETE FROM inventory_history')
  sqlite.exec('DELETE FROM inventory_lots')
  sqlite.exec('DELETE FROM product_nutrition')
  sqlite.exec('DELETE FROM products')
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM products').get()).toEqual({ n: 0 })
})
