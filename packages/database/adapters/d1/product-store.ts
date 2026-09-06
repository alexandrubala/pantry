import {
  normalizeProductName,
  planManualProduct,
  type ProductRecord,
  type ProductStore,
} from '@pantry/core'
import type { D1DatabaseLike } from './d1-like.js'

type ProductRow = {
  id: string
  name: string
  brand: string | null
  default_unit: ProductRecord['unit']
}

function newId(): string {
  return crypto.randomUUID()
}

function nowIso(): string {
  return new Date().toISOString()
}

function toProduct(row: ProductRow): ProductRecord {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    unit: row.default_unit,
  }
}

export function createD1ProductStore(db: D1DatabaseLike): ProductStore {
  return {
    async createManualProduct(input): Promise<ProductRecord> {
      const plan = planManualProduct({
        id: newId(),
        householdId: input.householdId,
        name: input.name,
        brand: input.brand,
        unit: input.unit,
        now: nowIso(),
      })

      await db
        .prepare(
          `INSERT INTO products (
             id, household_id, barcode, name, normalized_name, brand, default_unit, source, created_at, updated_at
           ) VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?6, 'manual', ?7, ?7)`,
        )
        .bind(
          plan.id,
          plan.householdId,
          plan.name,
          plan.normalizedName,
          plan.brand,
          plan.defaultUnit,
          plan.createdAt,
        )
        .run()

      return {
        id: plan.id,
        name: plan.name,
        brand: plan.brand,
        unit: plan.defaultUnit,
      }
    },

    async listProducts(input): Promise<ProductRecord[]> {
      const search = input.search?.trim() ?? ''
      const normalizedSearch = search ? normalizeProductName(search) : ''

      const result = await db
        .prepare(
          `SELECT id, name, brand, default_unit
           FROM products
           WHERE (household_id = ?1 OR household_id IS NULL)
             AND (?2 = '' OR normalized_name LIKE '%' || ?2 || '%')
           ORDER BY normalized_name ASC, name ASC`,
        )
        .bind(input.householdId, normalizedSearch)
        .all<ProductRow>()

      return result.results.map(toProduct)
    },

    async getReadableProduct(input): Promise<ProductRecord | null> {
      const row = await db
        .prepare(
          `SELECT id, name, brand, default_unit
           FROM products
           WHERE id = ?1 AND (household_id = ?2 OR household_id IS NULL)`,
        )
        .bind(input.productId, input.householdId)
        .first<ProductRow>()

      return row ? toProduct(row) : null
    },
  }
}
