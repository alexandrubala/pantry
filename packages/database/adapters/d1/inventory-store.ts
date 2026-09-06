import {
  DomainError,
  buildConsumptionPlan,
  expiresKey,
  normalizeProductName,
  parseExpiresOn,
  validateQuantity,
  type ConsumableLot,
  type ExternalCatalogId,
  type InventoryHistoryEntry,
  type InventoryItem,
  type InventoryStore,
  type ProductNutrition,
  type ProductRecord,
  type Unit,
} from '@pantry/core'
import type { D1DatabaseLike } from './d1-like.js'
import { createD1ProductStore } from './product-store.js'

type LotJoinRow = {
  lot_id: string
  product_id: string
  product_name: string
  product_brand: string | null
  product_unit: Unit
  product_barcode: string | null
  product_image_url: string | null
  product_external_catalog: ExternalCatalogId | null
  product_package_quantity: number | null
  product_package_unit: Unit | null
  energy_kcal_100g: number | null
  protein_g_100g: number | null
  carbohydrates_g_100g: number | null
  fat_g_100g: number | null
  sugars_g_100g: number | null
  fiber_g_100g: number | null
  salt_g_100g: number | null
  serving_size: string | null
  energy_kcal_serving: number | null
  protein_g_serving: number | null
  carbohydrates_g_serving: number | null
  fat_g_serving: number | null
  nutrition_updated_at: string | null
  location_id: string
  location_name: string
  quantity: number
  expires_on: string | null
}

type ConsumableLotRow = {
  id: string
  location_id: string
  quantity: number
  expires_on: string | null
  created_at: string
}

type HistoryRow = {
  id: string
  product_id: string
  location_id: string
  user_id: string
  action: InventoryHistoryEntry['action']
  delta_quantity: number
  unit: Unit
  expires_on: string | null
  created_at: string
}

type LocationRow = {
  id: string
  name: string
}

function newId(): string {
  return crypto.randomUUID()
}

function nowIso(): string {
  return new Date().toISOString()
}

function isConflictGuardError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  return /inventory_conflict_abort|CHECK constraint failed/i.test(error.message)
}

function toInventoryNutrition(row: LotJoinRow): ProductNutrition | null {
  if (!row.nutrition_updated_at) {
    return null
  }

  const nutrition: ProductNutrition = {
    energyKcal100g: row.energy_kcal_100g,
    proteinG100g: row.protein_g_100g,
    carbohydratesG100g: row.carbohydrates_g_100g,
    fatG100g: row.fat_g_100g,
    sugarsG100g: row.sugars_g_100g,
    fiberG100g: row.fiber_g_100g,
    saltG100g: row.salt_g_100g,
    servingSize: row.serving_size,
    energyKcalServing: row.energy_kcal_serving,
    proteinGServing: row.protein_g_serving,
    carbohydratesGServing: row.carbohydrates_g_serving,
    fatGServing: row.fat_g_serving,
  }

  return nutrition
}

function aggregateItems(rows: LotJoinRow[]): InventoryItem[] {
  const items = new Map<string, InventoryItem>()

  for (const row of rows) {
    const current = items.get(row.product_id) ?? {
      product: {
        id: row.product_id,
        name: row.product_name,
        brand: row.product_brand,
        unit: row.product_unit,
        barcode: row.product_barcode,
        imageUrl: row.product_image_url,
        externalCatalog: row.product_external_catalog,
        packageQuantity: row.product_package_quantity,
        packageUnit: row.product_package_unit,
        nutrition: toInventoryNutrition(row),
      },
      totalQuantity: 0,
      nearestExpiry: null,
      lots: [],
    }

    current.totalQuantity += row.quantity
    if (
      row.expires_on &&
      (current.nearestExpiry === null || row.expires_on < current.nearestExpiry)
    ) {
      current.nearestExpiry = row.expires_on
    }

    current.lots.push({
      id: row.lot_id,
      locationId: row.location_id,
      locationName: row.location_name,
      quantity: row.quantity,
      expiresOn: row.expires_on,
    })

    items.set(row.product_id, current)
  }

  return [...items.values()]
}

export function createD1InventoryStore(db: D1DatabaseLike): InventoryStore {
  const products = createD1ProductStore(db)

  async function requireReadableProduct(
    householdId: string,
    productId: string,
  ): Promise<ProductRecord> {
    const product = await products.getReadableProduct({ householdId, productId })
    if (!product) {
      throw new DomainError('NOT_FOUND', 'Not found')
    }

    return product
  }

  async function requireHouseholdLocation(householdId: string, locationId: string): Promise<LocationRow> {
    const location = await db
      .prepare(
        `SELECT id, name
         FROM locations
         WHERE id = ?1 AND household_id = ?2 AND is_active = 1`,
      )
      .bind(locationId, householdId)
      .first<LocationRow>()

    if (!location) {
      throw new DomainError('NOT_FOUND', 'Not found')
    }

    return location
  }

  async function readInventoryItem(
    householdId: string,
    productId: string,
  ): Promise<InventoryItem | null> {
    const items = await listInventory({ householdId, productId })
    return items[0] ?? null
  }

  async function listInventory(input: {
    householdId: string
    search?: string | null
    locationId?: string | null
    productId?: string | null
  }): Promise<InventoryItem[]> {
    const search = input.search?.trim() ?? ''
    const normalizedSearch = search ? normalizeProductName(search) : ''
    const locationId = input.locationId ?? ''
    const productId = input.productId ?? ''

    const result = await db
      .prepare(
        `SELECT
           l.id AS lot_id,
           l.product_id AS product_id,
           p.name AS product_name,
           p.brand AS product_brand,
           p.default_unit AS product_unit,
           p.barcode AS product_barcode,
           p.image_url AS product_image_url,
           p.external_catalog AS product_external_catalog,
           p.package_quantity AS product_package_quantity,
           p.package_unit AS product_package_unit,
           n.energy_kcal_100g AS energy_kcal_100g,
           n.protein_g_100g AS protein_g_100g,
           n.carbohydrates_g_100g AS carbohydrates_g_100g,
           n.fat_g_100g AS fat_g_100g,
           n.sugars_g_100g AS sugars_g_100g,
           n.fiber_g_100g AS fiber_g_100g,
           n.salt_g_100g AS salt_g_100g,
           n.serving_size AS serving_size,
           n.energy_kcal_serving AS energy_kcal_serving,
           n.protein_g_serving AS protein_g_serving,
           n.carbohydrates_g_serving AS carbohydrates_g_serving,
           n.fat_g_serving AS fat_g_serving,
           n.updated_at AS nutrition_updated_at,
           l.location_id AS location_id,
           loc.name AS location_name,
           l.quantity AS quantity,
           l.expires_on AS expires_on
         FROM inventory_lots l
         INNER JOIN products p ON p.id = l.product_id
         INNER JOIN locations loc ON loc.id = l.location_id
         LEFT JOIN product_nutrition n ON n.product_id = p.id
         WHERE l.household_id = ?1
           AND loc.household_id = ?1
           AND (p.household_id = ?1 OR p.household_id IS NULL)
           AND (?2 = '' OR loc.id = ?2)
           AND (?3 = '' OR p.normalized_name LIKE '%' || ?3 || '%')
           AND (?4 = '' OR l.product_id = ?4)
         ORDER BY
           p.normalized_name ASC,
           CASE WHEN l.expires_on IS NULL THEN 1 ELSE 0 END ASC,
           l.expires_on ASC,
           loc.sort_order ASC,
           l.id ASC`,
      )
      .bind(input.householdId, locationId, normalizedSearch, productId)
      .all<LotJoinRow>()

    return aggregateItems(result.results)
  }

  async function readLots(householdId: string, productId: string): Promise<ConsumableLot[]> {
    const result = await db
      .prepare(
        `SELECT id, location_id, quantity, expires_on, created_at
         FROM inventory_lots
         WHERE household_id = ?1 AND product_id = ?2`,
      )
      .bind(householdId, productId)
      .all<ConsumableLotRow>()

    return result.results.map((row) => ({
      id: row.id,
      locationId: row.location_id,
      quantity: row.quantity,
      expiresOn: row.expires_on,
      createdAt: row.created_at,
    }))
  }

  return {
    async getInventory(input) {
      if (input.locationId) {
        await requireHouseholdLocation(input.householdId, input.locationId)
      }

      return listInventory(input)
    },

    async addStock(input) {
      const quantity = validateQuantity(input.quantity)
      const expiresOn = parseExpiresOn(input.expiresOn)
      const product = await requireReadableProduct(input.householdId, input.productId)
      await requireHouseholdLocation(input.householdId, input.locationId)

      const now = nowIso()
      const lotId = newId()
      const historyId = newId()

      await db.batch([
        db
          .prepare(
            `INSERT INTO inventory_lots (
               id, household_id, product_id, location_id, quantity, expires_on, expires_key, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
             ON CONFLICT (household_id, product_id, location_id, expires_key) DO UPDATE SET
               quantity = inventory_lots.quantity + excluded.quantity,
               updated_at = excluded.updated_at`,
          )
          .bind(
            lotId,
            input.householdId,
            product.id,
            input.locationId,
            quantity,
            expiresOn,
            expiresKey(expiresOn),
            now,
          ),
        db
          .prepare(
            `INSERT INTO inventory_history (
               id, household_id, product_id, location_id, user_id, action, delta_quantity, unit, expires_on, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, 'add', ?6, ?7, ?8, ?9)`,
          )
          .bind(
            historyId,
            input.householdId,
            product.id,
            input.locationId,
            input.userId,
            quantity,
            product.unit,
            expiresOn,
            now,
          ),
      ])

      const item = await readInventoryItem(input.householdId, product.id)
      if (!item) {
        throw new DomainError('NOT_FOUND', 'Not found')
      }

      return item
    },

    async readLotsForConsumption(input) {
      await requireReadableProduct(input.householdId, input.productId)
      return readLots(input.householdId, input.productId)
    },

    async consume(input) {
      const quantity = validateQuantity(input.quantity)
      const product = await requireReadableProduct(input.householdId, input.productId)
      const lots = await readLots(input.householdId, product.id)
      const plan = buildConsumptionPlan(quantity, lots)

      if (!plan.ok) {
        throw new DomainError('INSUFFICIENT_STOCK', 'INSUFFICIENT_STOCK', {
          available: plan.available,
        })
      }

      const now = nowIso()
      const statements = [
        ...plan.allocations.map((allocation) => {
          const expectedQuantity = allocation.quantity + allocation.remainingQuantity
          return db
            .prepare(
              `INSERT INTO inventory_conflict_abort (reason)
               SELECT 'STALE_LOT'
               WHERE NOT EXISTS (
                 SELECT 1
                 FROM inventory_lots
                 WHERE id = ?1
                   AND household_id = ?2
                   AND product_id = ?3
                   AND quantity = ?4
               )`,
            )
            .bind(allocation.lotId, input.householdId, product.id, expectedQuantity)
        }),
        ...plan.allocations.map((allocation) => {
          if (allocation.remainingQuantity <= 1e-9) {
            return db
              .prepare(
                `DELETE FROM inventory_lots
                 WHERE id = ?1 AND household_id = ?2 AND product_id = ?3`,
              )
              .bind(allocation.lotId, input.householdId, product.id)
          }

          return db
            .prepare(
              `UPDATE inventory_lots
               SET quantity = ?1, updated_at = ?2
               WHERE id = ?3 AND household_id = ?4 AND product_id = ?5`,
            )
            .bind(
              allocation.remainingQuantity,
              now,
              allocation.lotId,
              input.householdId,
              product.id,
            )
        }),
        ...plan.allocations.map((allocation) =>
          db
            .prepare(
              `INSERT INTO inventory_history (
                 id, household_id, product_id, location_id, user_id, action, delta_quantity, unit, expires_on, created_at
               ) VALUES (?1, ?2, ?3, ?4, ?5, 'consume', ?6, ?7, ?8, ?9)`,
            )
            .bind(
              newId(),
              input.householdId,
              product.id,
              allocation.locationId,
              input.userId,
              -allocation.quantity,
              product.unit,
              allocation.expiresOn,
              now,
            ),
        ),
      ]

      try {
        await db.batch(statements)
      } catch (error) {
        if (isConflictGuardError(error)) {
          throw new DomainError('STOCK_CONFLICT', 'STOCK_CONFLICT')
        }

        throw error
      }

      return {
        item: await readInventoryItem(input.householdId, product.id),
        plan,
      }
    },

    async listHistory(input) {
      if (input.productId) {
        await requireReadableProduct(input.householdId, input.productId)
      }

      const limit = input.limit && input.limit > 0 ? Math.min(input.limit, 50) : 50
      const productId = input.productId ?? ''
      const result = await db
        .prepare(
          `SELECT id, product_id, location_id, user_id, action, delta_quantity, unit, expires_on, created_at
           FROM inventory_history
           WHERE household_id = ?1
             AND (?2 = '' OR product_id = ?2)
           ORDER BY created_at DESC, id DESC
           LIMIT ?3`,
        )
        .bind(input.householdId, productId, limit)
        .all<HistoryRow>()

      return result.results.map((row) => ({
        id: row.id,
        productId: row.product_id,
        locationId: row.location_id,
        userId: row.user_id,
        action: row.action,
        deltaQuantity: row.delta_quantity,
        unit: row.unit,
        expiresOn: row.expires_on,
        createdAt: row.created_at,
      }))
    },
  }
}
