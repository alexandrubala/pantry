import {
  DomainError,
  addDaysIso,
  buildConsumptionPlan,
  calendarDaysBetween,
  classifyExpiry,
  expiresKey,
  isLowStock,
  normalizeProductName,
  parseExpiresOn,
  parseRequiredIsoDate,
  validateMinimumQuantity,
  validateNonNegativeQuantity,
  validateProductUnit,
  validateQuantity,
  type ConsumableLot,
  type ExpiringLot,
  type ExternalCatalogId,
  type InventoryHistoryEditMetadata,
  type InventoryHistoryEntry,
  type InventoryItem,
  type InventoryStore,
  type InventorySummary,
  type ProductNutrition,
  type ProductRecord,
  type Unit,
} from '@pantry/core'
import type { D1DatabaseLike } from './d1-like.js'
import {
  isConflictGuardError,
  isUniqueConstraintError,
  lotConsumptionStatements,
  staleLotAbortStatement,
} from './lot-consumption.js'
import { createD1ProductStore } from './product-store.js'

type LotJoinRow = {
  lot_id: string | null
  product_id: string
  product_name: string
  product_brand: string | null
  product_unit: Unit
  product_barcode: string | null
  product_image_url: string | null
  custom_image_updated_at: string | null
  product_source: 'manual' | 'open_food_facts'
  product_household_id: string | null
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
  location_id: string | null
  location_name: string | null
  quantity: number | null
  expires_on: string | null
  minimum_quantity: number
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
  product_name: string
  location_id: string
  location_name: string
  user_id: string
  action: InventoryHistoryEntry['action']
  delta_quantity: number
  unit: Unit
  expires_on: string | null
  metadata: string | null
  created_at: string
}

type LocationRow = {
  id: string
  name: string
}

type LotRow = {
  id: string
  product_id: string
  location_id: string
  quantity: number
  expires_on: string | null
  expires_key: string
}

type CountRow = {
  n: number
}

type ExpiringRow = {
  id: string
  product_id: string
  product_name: string
  product_brand: string | null
  product_unit: Unit
  location_id: string
  location_name: string
  quantity: number
  expires_on: string
}

function newId(): string {
  return crypto.randomUUID()
}

function nowIso(): string {
  return new Date().toISOString()
}

function requireLocationId(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DomainError('NOT_FOUND', 'Not found')
  }

  return value.trim()
}

function parseEditMetadata(value: string | null): InventoryHistoryEditMetadata | null {
  if (!value) {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }

    const record = parsed as Record<string, unknown>
    if (typeof record.oldLocationId !== 'string' || typeof record.newLocationId !== 'string') {
      return null
    }

    const oldExpiresOn = record.oldExpiresOn == null ? null : record.oldExpiresOn
    const newExpiresOn = record.newExpiresOn == null ? null : record.newExpiresOn
    if (oldExpiresOn != null && typeof oldExpiresOn !== 'string') {
      return null
    }
    if (newExpiresOn != null && typeof newExpiresOn !== 'string') {
      return null
    }

    return {
      oldLocationId: record.oldLocationId,
      newLocationId: record.newLocationId,
      oldExpiresOn: oldExpiresOn as string | null,
      newExpiresOn: newExpiresOn as string | null,
    }
  } catch {
    return null
  }
}

function parseLotOverrideQuantities(value: unknown): Array<{ lotId: string; quantity: number }> {
  if (!Array.isArray(value)) {
    throw new DomainError('INVALID_QUANTITY', 'Invalid quantity')
  }

  return value.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new DomainError('INVALID_QUANTITY', 'Invalid quantity')
    }

    const record = entry as Record<string, unknown>
    if (typeof record.lotId !== 'string' || record.lotId.trim() === '') {
      throw new DomainError('NOT_FOUND', 'Not found')
    }

    return {
      lotId: record.lotId.trim(),
      quantity: validateNonNegativeQuantity(record.quantity),
    }
  })
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

function emptyItem(row: LotJoinRow): InventoryItem {
  const minimumQuantity = row.minimum_quantity
  const totalQuantity = 0
  return {
    product: {
      id: row.product_id,
      name: row.product_name,
      brand: row.product_brand,
      unit: row.product_unit,
      barcode: row.product_barcode,
      imageUrl: row.product_image_url,
      hasCustomImage: row.custom_image_updated_at != null,
      customImageUpdatedAt: row.custom_image_updated_at ?? null,
      source: row.product_source,
      householdOwned: row.product_household_id != null && row.product_source === 'manual',
      externalCatalog: row.product_external_catalog,
      packageQuantity: row.product_package_quantity,
      packageUnit: row.product_package_unit,
      nutrition: toInventoryNutrition(row),
    },
    totalQuantity,
    nearestExpiry: null,
    lots: [],
    minimumQuantity,
    lowStock: isLowStock(totalQuantity, minimumQuantity),
  }
}

function aggregateItems(rows: LotJoinRow[]): InventoryItem[] {
  const items = new Map<string, InventoryItem>()

  for (const row of rows) {
    const current = items.get(row.product_id) ?? emptyItem(row)

    if (row.lot_id && row.location_id && row.location_name && row.quantity != null) {
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
      current.lowStock = isLowStock(current.totalQuantity, current.minimumQuantity)
    }

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

  async function requireHouseholdLot(householdId: string, lotId: string): Promise<LotRow> {
    const lot = await db
      .prepare(
        `SELECT id, product_id, location_id, quantity, expires_on, expires_key
         FROM inventory_lots
         WHERE id = ?1 AND household_id = ?2`,
      )
      .bind(lotId, householdId)
      .first<LotRow>()

    if (!lot) {
      throw new DomainError('NOT_FOUND', 'Not found')
    }

    return lot
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
           p.id AS product_id,
           p.name AS product_name,
           p.brand AS product_brand,
           p.default_unit AS product_unit,
           p.barcode AS product_barcode,
           p.image_url AS product_image_url,
           hpi.updated_at AS custom_image_updated_at,
           p.source AS product_source,
           p.household_id AS product_household_id,
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
           l.expires_on AS expires_on,
           COALESCE(s.minimum_quantity, 0) AS minimum_quantity
         FROM products p
         INNER JOIN (
           SELECT DISTINCT product_id
           FROM inventory_lots
           WHERE household_id = ?1
           UNION
           SELECT product_id
           FROM inventory_settings
           WHERE household_id = ?1 AND minimum_quantity > 0
         ) tracked ON tracked.product_id = p.id
         LEFT JOIN inventory_lots l
           ON l.household_id = ?1 AND l.product_id = p.id
         LEFT JOIN locations loc
           ON loc.id = l.location_id AND loc.household_id = ?1
         LEFT JOIN inventory_settings s
           ON s.household_id = ?1 AND s.product_id = p.id
         LEFT JOIN product_nutrition n ON n.product_id = p.id
         LEFT JOIN household_product_images hpi
           ON hpi.household_id = ?1 AND hpi.product_id = p.id
         WHERE (p.household_id = ?1 OR p.household_id IS NULL)
           AND (?2 = '' OR l.location_id = ?2)
           AND (?3 = '' OR p.normalized_name LIKE '%' || ?3 || '%')
           AND (?4 = '' OR p.id = ?4)
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

  async function count(query: string, ...params: unknown[]): Promise<number> {
    const row = await db.prepare(query).bind(...params).first<CountRow>()
    return row?.n ?? 0
  }

  return {
    async getInventory(input) {
      if (input.locationId) {
        await requireHouseholdLocation(input.householdId, input.locationId)
      }

      return listInventory(input)
    },

    async getSummary(input) {
      const today = parseRequiredIsoDate(input.today)
      const until = addDaysIso(today, 7)
      const householdId = input.householdId

      const [productsCount, lots, expired, expiringSoon, lowStock] = await Promise.all([
        count(
          `SELECT COUNT(*) AS n FROM (
             SELECT DISTINCT product_id FROM inventory_lots WHERE household_id = ?1
             UNION
             SELECT product_id FROM inventory_settings WHERE household_id = ?1 AND minimum_quantity > 0
           )`,
          householdId,
        ),
        count(`SELECT COUNT(*) AS n FROM inventory_lots WHERE household_id = ?1`, householdId),
        count(
          `SELECT COUNT(*) AS n
           FROM inventory_lots
           WHERE household_id = ?1 AND expires_on IS NOT NULL AND expires_on < ?2`,
          householdId,
          today,
        ),
        count(
          `SELECT COUNT(*) AS n
           FROM inventory_lots
           WHERE household_id = ?1 AND expires_on IS NOT NULL AND expires_on >= ?2 AND expires_on <= ?3`,
          householdId,
          today,
          until,
        ),
        count(
          `SELECT COUNT(*) AS n FROM (
             SELECT s.product_id
             FROM inventory_settings s
             LEFT JOIN inventory_lots l
               ON l.household_id = s.household_id AND l.product_id = s.product_id
             WHERE s.household_id = ?1 AND s.minimum_quantity > 0
             GROUP BY s.product_id, s.minimum_quantity
             HAVING COALESCE(SUM(l.quantity), 0) <= s.minimum_quantity
           )`,
          householdId,
        ),
      ])

      const summary: InventorySummary = {
        products: productsCount,
        lots,
        lowStock,
        expiringSoon,
        expired,
      }
      return summary
    },

    async listExpiring(input) {
      const today = parseRequiredIsoDate(input.today)
      const days = input.days
      const until = addDaysIso(today, days)
      const result = await db
        .prepare(
          `SELECT
             l.id AS id,
             l.product_id AS product_id,
             p.name AS product_name,
             p.brand AS product_brand,
             p.default_unit AS product_unit,
             l.location_id AS location_id,
             loc.name AS location_name,
             l.quantity AS quantity,
             l.expires_on AS expires_on
           FROM inventory_lots l
           INNER JOIN products p ON p.id = l.product_id
           INNER JOIN locations loc ON loc.id = l.location_id
           WHERE l.household_id = ?1
             AND loc.household_id = ?1
             AND (p.household_id = ?1 OR p.household_id IS NULL)
             AND l.expires_on IS NOT NULL
             AND l.expires_on <= ?2
           ORDER BY
             CASE WHEN l.expires_on < ?3 THEN 0 ELSE 1 END ASC,
             l.expires_on ASC,
             l.id ASC`,
        )
        .bind(input.householdId, until, today)
        .all<ExpiringRow>()

      const lots: ExpiringLot[] = []
      for (const row of result.results) {
        const status = classifyExpiry(row.expires_on, today)
        if (status === 'none' || status === 'later') {
          continue
        }

        lots.push({
          id: row.id,
          productId: row.product_id,
          productName: row.product_name,
          brand: row.product_brand,
          locationId: row.location_id,
          locationName: row.location_name,
          quantity: row.quantity,
          unit: row.product_unit,
          expiresOn: row.expires_on,
          daysRemaining: calendarDaysBetween(today, row.expires_on),
          status,
        })
      }

      return lots
    },

    async setMinimumQuantity(input) {
      const product = await requireReadableProduct(input.householdId, input.productId)
      const minimumQuantity = validateMinimumQuantity(input.minimumQuantity)
      const now = nowIso()

      await db
        .prepare(
          `INSERT INTO inventory_settings (household_id, product_id, minimum_quantity, updated_at)
           VALUES (?1, ?2, ?3, ?4)
           ON CONFLICT (household_id, product_id) DO UPDATE SET
             minimum_quantity = excluded.minimum_quantity,
             updated_at = excluded.updated_at`,
        )
        .bind(input.householdId, product.id, minimumQuantity, now)
        .run()

      return {
        productId: product.id,
        minimumQuantity,
        unit: product.unit,
      }
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

    async adjustLot(input) {
      const expectedQuantity = validateQuantity(input.expectedQuantity)
      const quantity = validateNonNegativeQuantity(input.quantity)
      const lot = await requireHouseholdLot(input.householdId, input.lotId)
      const product = await requireReadableProduct(input.householdId, lot.product_id)
      const delta = quantity - expectedQuantity

      if (delta === 0 && lot.quantity === expectedQuantity) {
        return readInventoryItem(input.householdId, product.id)
      }

      if (delta === 0) {
        throw new DomainError('INVENTORY_CHANGED', 'INVENTORY_CHANGED')
      }

      const now = nowIso()
      const statements = [
        staleLotAbortStatement(db, {
          lotId: lot.id,
          householdId: input.householdId,
          expectedQuantity,
        }),
        quantity === 0
          ? db
              .prepare(
                `DELETE FROM inventory_lots
                 WHERE id = ?1 AND household_id = ?2`,
              )
              .bind(lot.id, input.householdId)
          : db
              .prepare(
                `UPDATE inventory_lots
                 SET quantity = ?1, updated_at = ?2
                 WHERE id = ?3 AND household_id = ?4`,
              )
              .bind(quantity, now, lot.id, input.householdId),
        db
          .prepare(
            `INSERT INTO inventory_history (
               id, household_id, product_id, location_id, user_id, action, delta_quantity, unit, expires_on, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, 'adjust', ?6, ?7, ?8, ?9)`,
          )
          .bind(
            newId(),
            input.householdId,
            product.id,
            lot.location_id,
            input.userId,
            delta,
            product.unit,
            lot.expires_on,
            now,
          ),
      ]

      try {
        await db.batch(statements)
      } catch (error) {
        if (isConflictGuardError(error)) {
          throw new DomainError('INVENTORY_CHANGED', 'INVENTORY_CHANGED')
        }

        throw error
      }

      return readInventoryItem(input.householdId, product.id)
    },

    async updateLot(input) {
      const expectedQuantity = validateQuantity(input.expected.quantity)
      const expectedLocationId = requireLocationId(input.expected.locationId)
      const expectedExpiresOn = parseExpiresOn(input.expected.expiresOn)
      const quantity = validateNonNegativeQuantity(input.quantity)
      const locationId = requireLocationId(input.locationId)
      const expiresOn = parseExpiresOn(input.expiresOn)
      const lot = await requireHouseholdLot(input.householdId, input.lotId)
      const destination = await requireHouseholdLocation(input.householdId, locationId)
      const product = await requireReadableProduct(input.householdId, lot.product_id)

      if (
        lot.quantity !== expectedQuantity ||
        lot.location_id !== expectedLocationId ||
        expiresKey(lot.expires_on) !== expiresKey(expectedExpiresOn)
      ) {
        throw new DomainError('INVENTORY_CHANGED', 'INVENTORY_CHANGED')
      }

      const locationChanged = lot.location_id !== destination.id
      const expiryChanged = expiresKey(lot.expires_on) !== expiresKey(expiresOn)
      const quantityChanged = lot.quantity !== quantity

      if (!locationChanged && !expiryChanged && !quantityChanged) {
        return readInventoryItem(input.householdId, product.id)
      }

      const now = nowIso()
      const staleSource = staleLotAbortStatement(db, {
        lotId: lot.id,
        householdId: input.householdId,
        expectedQuantity,
        locationId: lot.location_id,
        expiresKey: lot.expires_key,
      })

      if (quantity === 0) {
        const statements = [
          staleSource,
          db
            .prepare(
              `DELETE FROM inventory_lots
               WHERE id = ?1 AND household_id = ?2`,
            )
            .bind(lot.id, input.householdId),
          db
            .prepare(
              `INSERT INTO inventory_history (
                 id, household_id, product_id, location_id, user_id, action, delta_quantity, unit, expires_on, created_at
               ) VALUES (?1, ?2, ?3, ?4, ?5, 'adjust', ?6, ?7, ?8, ?9)`,
            )
            .bind(
              newId(),
              input.householdId,
              product.id,
              lot.location_id,
              input.userId,
              -expectedQuantity,
              product.unit,
              lot.expires_on,
              now,
            ),
        ]

        try {
          await db.batch(statements)
        } catch (error) {
          if (isConflictGuardError(error)) {
            throw new DomainError('INVENTORY_CHANGED', 'INVENTORY_CHANGED')
          }

          throw error
        }

        return readInventoryItem(input.householdId, product.id)
      }

      if (!locationChanged && !expiryChanged) {
        return this.adjustLot({
          householdId: input.householdId,
          userId: input.userId,
          lotId: lot.id,
          expectedQuantity,
          quantity,
        })
      }

      const matching = await db
        .prepare(
          `SELECT id, product_id, location_id, quantity, expires_on, expires_key
           FROM inventory_lots
           WHERE household_id = ?1
             AND product_id = ?2
             AND location_id = ?3
             AND expires_key = ?4
             AND id != ?5`,
        )
        .bind(input.householdId, lot.product_id, destination.id, expiresKey(expiresOn), lot.id)
        .first<LotRow>()

      const metadata: InventoryHistoryEditMetadata = {
        oldLocationId: lot.location_id,
        newLocationId: destination.id,
        oldExpiresOn: lot.expires_on,
        newExpiresOn: expiresOn,
      }
      const statements = [staleSource]

      if (matching) {
        statements.push(
          staleLotAbortStatement(db, {
            lotId: matching.id,
            householdId: input.householdId,
            expectedQuantity: matching.quantity,
            locationId: matching.location_id,
            expiresKey: matching.expires_key,
          }),
          db
            .prepare(
              `UPDATE inventory_lots
               SET quantity = quantity + ?1, updated_at = ?2
               WHERE id = ?3 AND household_id = ?4`,
            )
            .bind(quantity, now, matching.id, input.householdId),
          db.prepare(`DELETE FROM inventory_lots WHERE id = ?1 AND household_id = ?2`).bind(lot.id, input.householdId),
        )
      } else {
        statements.push(
          db
            .prepare(
              `UPDATE inventory_lots
               SET location_id = ?1,
                   expires_on = ?2,
                   expires_key = ?3,
                   quantity = ?4,
                   updated_at = ?5
               WHERE id = ?6
                 AND household_id = ?7
                 AND location_id = ?8
                 AND expires_key = ?9
                 AND quantity = ?10`,
            )
            .bind(
              destination.id,
              expiresOn,
              expiresKey(expiresOn),
              quantity,
              now,
              lot.id,
              input.householdId,
              lot.location_id,
              lot.expires_key,
              lot.quantity,
            ),
        )
      }

      statements.push(
        db
          .prepare(
            `INSERT INTO inventory_history (
               id, household_id, product_id, location_id, user_id, action, delta_quantity, unit, expires_on, metadata, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, 'edit', ?6, ?7, ?8, ?9, ?10)`,
          )
          .bind(
            newId(),
            input.householdId,
            product.id,
            destination.id,
            input.userId,
            quantity - expectedQuantity,
            product.unit,
            expiresOn,
            JSON.stringify(metadata),
            now,
          ),
      )

      try {
        await db.batch(statements)
      } catch (error) {
        if (isConflictGuardError(error) || isUniqueConstraintError(error)) {
          throw new DomainError('INVENTORY_CHANGED', 'INVENTORY_CHANGED')
        }

        throw error
      }

      return readInventoryItem(input.householdId, product.id)
    },

    async overrideHouseholdUnit(input) {
      const unit = validateProductUnit(typeof input.unit === 'string' ? input.unit : '')
      const lotQuantities = parseLotOverrideQuantities(input.lots)
      const source = await requireReadableProduct(input.householdId, input.productId)
      if (source.unit === unit) {
        throw new DomainError('INVALID_UNIT', 'Invalid unit')
      }

      const currentLots = await db
        .prepare(
          `SELECT id, product_id, location_id, quantity, expires_on, expires_key
           FROM inventory_lots
           WHERE household_id = ?1 AND product_id = ?2
           ORDER BY id ASC`,
        )
        .bind(input.householdId, source.id)
        .all<LotRow>()

      const currentIds = new Set(currentLots.results.map((lot) => lot.id))
      const mappedIds = new Set(lotQuantities.map((lot) => lot.lotId))
      if (currentIds.size !== mappedIds.size || [...currentIds].some((id) => !mappedIds.has(id))) {
        throw new DomainError('INVENTORY_CHANGED', 'INVENTORY_CHANGED')
      }

      const override = await products.createHouseholdOverrideProduct({
        householdId: input.householdId,
        sourceProductId: source.id,
        unit,
      })

      const quantityByLotId = new Map(lotQuantities.map((lot) => [lot.lotId, lot.quantity]))
      const now = nowIso()
      const statements = currentLots.results.flatMap((lot) => {
        const nextQuantity = quantityByLotId.get(lot.id) ?? 0
        const stale = staleLotAbortStatement(db, {
          lotId: lot.id,
          householdId: input.householdId,
          expectedQuantity: lot.quantity,
          locationId: lot.location_id,
          expiresKey: lot.expires_key,
        })
        const remove = [
          stale,
          db.prepare(`DELETE FROM inventory_lots WHERE id = ?1 AND household_id = ?2`).bind(lot.id, input.householdId),
          db
            .prepare(
              `INSERT INTO inventory_history (
                 id, household_id, product_id, location_id, user_id, action, delta_quantity, unit, expires_on, created_at
               ) VALUES (?1, ?2, ?3, ?4, ?5, 'adjust', ?6, ?7, ?8, ?9)`,
            )
            .bind(
              newId(),
              input.householdId,
              source.id,
              lot.location_id,
              input.userId,
              -lot.quantity,
              source.unit,
              lot.expires_on,
              now,
            ),
        ]

        if (nextQuantity <= 0) {
          return remove
        }

        return [
          ...remove,
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
              newId(),
              input.householdId,
              override.id,
              lot.location_id,
              nextQuantity,
              lot.expires_on,
              lot.expires_key,
              now,
            ),
          db
            .prepare(
              `INSERT INTO inventory_history (
                 id, household_id, product_id, location_id, user_id, action, delta_quantity, unit, expires_on, created_at
               ) VALUES (?1, ?2, ?3, ?4, ?5, 'add', ?6, ?7, ?8, ?9)`,
            )
            .bind(
              newId(),
              input.householdId,
              override.id,
              lot.location_id,
              input.userId,
              nextQuantity,
              override.unit,
              lot.expires_on,
              now,
            ),
        ]
      })

      statements.push(
        db
          .prepare(
            `INSERT INTO inventory_settings (household_id, product_id, minimum_quantity, updated_at)
             SELECT household_id, ?1, minimum_quantity, ?2
             FROM inventory_settings
             WHERE household_id = ?3 AND product_id = ?4
             ON CONFLICT (household_id, product_id) DO UPDATE SET
               minimum_quantity = excluded.minimum_quantity,
               updated_at = excluded.updated_at`,
          )
          .bind(override.id, now, input.householdId, source.id),
        db
          .prepare(`DELETE FROM inventory_settings WHERE household_id = ?1 AND product_id = ?2`)
          .bind(input.householdId, source.id),
      )

      try {
        await db.batch(statements)
      } catch (error) {
        if (isConflictGuardError(error) || isUniqueConstraintError(error)) {
          throw new DomainError('INVENTORY_CHANGED', 'INVENTORY_CHANGED')
        }

        throw error
      }

      return readInventoryItem(input.householdId, override.id)
    },

    async moveLot(input) {
      const lot = await requireHouseholdLot(input.householdId, input.lotId)
      const destination = await requireHouseholdLocation(input.householdId, input.locationId)
      const product = await requireReadableProduct(input.householdId, lot.product_id)

      if (lot.location_id === destination.id) {
        const item = await readInventoryItem(input.householdId, product.id)
        if (!item) {
          throw new DomainError('NOT_FOUND', 'Not found')
        }
        return item
      }

      const matching = await db
        .prepare(
          `SELECT id, product_id, location_id, quantity, expires_on, expires_key
           FROM inventory_lots
           WHERE household_id = ?1
             AND product_id = ?2
             AND location_id = ?3
             AND expires_key = ?4`,
        )
        .bind(input.householdId, lot.product_id, destination.id, lot.expires_key)
        .first<LotRow>()

      const now = nowIso()
      const statements = [
        staleLotAbortStatement(db, {
          lotId: lot.id,
          householdId: input.householdId,
          expectedQuantity: lot.quantity,
          locationId: lot.location_id,
        }),
      ]

      if (matching) {
        statements.push(
          staleLotAbortStatement(db, {
            lotId: matching.id,
            householdId: input.householdId,
            expectedQuantity: matching.quantity,
            locationId: matching.location_id,
          }),
          db
            .prepare(
              `UPDATE inventory_lots
               SET quantity = quantity + ?1, updated_at = ?2
               WHERE id = ?3 AND household_id = ?4`,
            )
            .bind(lot.quantity, now, matching.id, input.householdId),
          db
            .prepare(`DELETE FROM inventory_lots WHERE id = ?1 AND household_id = ?2`)
            .bind(lot.id, input.householdId),
        )
      } else {
        statements.push(
          db
            .prepare(
              `UPDATE inventory_lots
               SET location_id = ?1, updated_at = ?2
               WHERE id = ?3 AND household_id = ?4 AND location_id = ?5 AND quantity = ?6`,
            )
            .bind(
              destination.id,
              now,
              lot.id,
              input.householdId,
              lot.location_id,
              lot.quantity,
            ),
        )
      }

      statements.push(
        db
          .prepare(
            `INSERT INTO inventory_history (
               id, household_id, product_id, location_id, user_id, action, delta_quantity, unit, expires_on, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, 'move', ?6, ?7, ?8, ?9)`,
          )
          .bind(
            newId(),
            input.householdId,
            product.id,
            lot.location_id,
            input.userId,
            -lot.quantity,
            product.unit,
            lot.expires_on,
            now,
          ),
        db
          .prepare(
            `INSERT INTO inventory_history (
               id, household_id, product_id, location_id, user_id, action, delta_quantity, unit, expires_on, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, 'move', ?6, ?7, ?8, ?9)`,
          )
          .bind(
            newId(),
            input.householdId,
            product.id,
            destination.id,
            input.userId,
            lot.quantity,
            product.unit,
            lot.expires_on,
            now,
          ),
      )

      try {
        await db.batch(statements)
      } catch (error) {
        if (isConflictGuardError(error) || isUniqueConstraintError(error)) {
          throw new DomainError('INVENTORY_CHANGED', 'INVENTORY_CHANGED')
        }

        throw error
      }

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
      const statements = lotConsumptionStatements(db, {
        householdId: input.householdId,
        userId: input.userId,
        productId: product.id,
        unit: product.unit,
        allocations: plan.allocations,
        now,
      })

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
          `SELECT
             h.id AS id,
             h.product_id AS product_id,
             p.name AS product_name,
             h.location_id AS location_id,
             loc.name AS location_name,
             h.user_id AS user_id,
             h.action AS action,
             h.delta_quantity AS delta_quantity,
             h.unit AS unit,
             h.expires_on AS expires_on,
             h.metadata AS metadata,
             h.created_at AS created_at
           FROM inventory_history h
           INNER JOIN products p ON p.id = h.product_id
           INNER JOIN locations loc ON loc.id = h.location_id
           WHERE h.household_id = ?1
             AND loc.household_id = ?1
             AND (?2 = '' OR h.product_id = ?2)
           ORDER BY h.created_at DESC, h.id DESC
           LIMIT ?3`,
        )
        .bind(input.householdId, productId, limit)
        .all<HistoryRow>()

      return result.results.map((row) => ({
        id: row.id,
        productId: row.product_id,
        productName: row.product_name,
        locationId: row.location_id,
        locationName: row.location_name,
        userId: row.user_id,
        action: row.action,
        deltaQuantity: row.delta_quantity,
        unit: row.unit,
        expiresOn: row.expires_on,
        metadata: parseEditMetadata(row.metadata),
        createdAt: row.created_at,
      }))
    },
  }
}
