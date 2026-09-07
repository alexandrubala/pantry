import {
  DomainError,
  isEmptyNutrition,
  normalizeProductName,
  planExternalProduct,
  planManualProduct,
  validateBarcode,
  validateProductBrand,
  validateProductName,
  validateProductUnit,
  type ExternalCatalogId,
  type HouseholdProductImageRecord,
  type ProductNutrition,
  type ProductRecord,
  type ProductStore,
  type Unit,
} from '@pantry/core'
import type { D1DatabaseLike } from './d1-like.js'

type ProductRow = {
  id: string
  household_id: string | null
  name: string
  brand: string | null
  default_unit: Unit
  barcode: string | null
  image_url: string | null
  source: ProductRecord['source']
  external_catalog: ExternalCatalogId | null
  external_product_type: string | null
  package_quantity: number | null
  package_unit: Unit | null
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
  custom_image_updated_at: string | null
}

const PRODUCT_COLUMNS = `SELECT
  p.id AS id,
  p.household_id AS household_id,
  p.name AS name,
  p.brand AS brand,
  p.default_unit AS default_unit,
  p.barcode AS barcode,
  p.image_url AS image_url,
  p.source AS source,
  p.external_catalog AS external_catalog,
  p.external_product_type AS external_product_type,
  p.package_quantity AS package_quantity,
  p.package_unit AS package_unit,
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
  n.updated_at AS nutrition_updated_at`

function productSelect(customImageHouseholdBind: string | null): string {
  const customColumn = customImageHouseholdBind
    ? 'hpi.updated_at AS custom_image_updated_at'
    : 'NULL AS custom_image_updated_at'
  const join = customImageHouseholdBind
    ? `LEFT JOIN household_product_images hpi
         ON hpi.product_id = p.id AND hpi.household_id = ${customImageHouseholdBind}`
    : ''

  return `${PRODUCT_COLUMNS},
  ${customColumn}
FROM products p
LEFT JOIN product_nutrition n ON n.product_id = p.id
${join}`
}

function newId(): string {
  return crypto.randomUUID()
}

function nowIso(): string {
  return new Date().toISOString()
}

function isUniqueConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  return /UNIQUE constraint failed/i.test(error.message)
}

function toNutrition(row: ProductRow): ProductNutrition | null {
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

function toProduct(row: ProductRow): ProductRecord {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    unit: row.default_unit,
    barcode: row.barcode,
    imageUrl: row.image_url,
    source: row.source,
    externalCatalog: row.external_catalog,
    externalProductType: row.external_product_type,
    packageQuantity: row.package_quantity,
    packageUnit: row.package_unit,
    nutrition: toNutrition(row),
    hasCustomImage: row.custom_image_updated_at != null,
    customImageUpdatedAt: row.custom_image_updated_at ?? null,
  }
}

function nutritionBindValues(productId: string, nutrition: ProductNutrition, now: string) {
  return [
    productId,
    nutrition.energyKcal100g,
    nutrition.proteinG100g,
    nutrition.carbohydratesG100g,
    nutrition.fatG100g,
    nutrition.sugarsG100g,
    nutrition.fiberG100g,
    nutrition.saltG100g,
    nutrition.servingSize,
    nutrition.energyKcalServing,
    nutrition.proteinGServing,
    nutrition.carbohydratesGServing,
    nutrition.fatGServing,
    now,
  ]
}

type HouseholdProductImageRow = {
  r2_key: string
  content_type: string
  created_by_user_id: string
  created_at: string
  updated_at: string
}

function toImageRecord(row: HouseholdProductImageRow): HouseholdProductImageRecord {
  return {
    r2Key: row.r2_key,
    contentType: row.content_type,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function createD1ProductStore(db: D1DatabaseLike): ProductStore {
  async function readById(productId: string, householdId?: string | null): Promise<ProductRecord | null> {
    const row = householdId
      ? await db
          .prepare(`${productSelect('?2')} WHERE p.id = ?1`)
          .bind(productId, householdId)
          .first<ProductRow>()
      : await db
          .prepare(`${productSelect(null)} WHERE p.id = ?1`)
          .bind(productId)
          .first<ProductRow>()

    return row ? toProduct(row) : null
  }

  async function readHouseholdImage(
    householdId: string,
    productId: string,
  ): Promise<HouseholdProductImageRecord | null> {
    const row = await db
      .prepare(
        `SELECT r2_key, content_type, created_by_user_id, created_at, updated_at
         FROM household_product_images
         WHERE household_id = ?1 AND product_id = ?2`,
      )
      .bind(householdId, productId)
      .first<HouseholdProductImageRow>()

    return row ? toImageRecord(row) : null
  }

  async function persistNutritionIfMissing(
    productId: string,
    nutrition: ProductNutrition | null,
    now: string,
  ): Promise<void> {
    if (!nutrition || isEmptyNutrition(nutrition)) {
      return
    }

    await db
      .prepare(
        `INSERT OR IGNORE INTO product_nutrition (
           product_id, energy_kcal_100g, protein_g_100g, carbohydrates_g_100g, fat_g_100g,
           sugars_g_100g, fiber_g_100g, salt_g_100g, serving_size,
           energy_kcal_serving, protein_g_serving, carbohydrates_g_serving, fat_g_serving, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`,
      )
      .bind(...nutritionBindValues(productId, nutrition, now))
      .run()
  }

  return {
    async createManualProduct(input): Promise<ProductRecord> {
      const plan = planManualProduct({
        id: newId(),
        householdId: input.householdId,
        name: input.name,
        brand: input.brand,
        unit: input.unit,
        barcode: input.barcode,
        now: nowIso(),
      })

      try {
        await db
          .prepare(
            `INSERT INTO products (
               id, household_id, barcode, name, normalized_name, brand, default_unit, source, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'manual', ?8, ?8)`,
          )
          .bind(
            plan.id,
            plan.householdId,
            plan.barcode,
            plan.name,
            plan.normalizedName,
            plan.brand,
            plan.defaultUnit,
            plan.createdAt,
          )
          .run()
      } catch (error) {
        if (plan.barcode && isUniqueConstraintError(error)) {
          throw new DomainError('BARCODE_TAKEN', 'Barcode already exists')
        }

        throw error
      }

      return {
        id: plan.id,
        name: plan.name,
        brand: plan.brand,
        unit: plan.defaultUnit,
        barcode: plan.barcode,
        imageUrl: null,
        hasCustomImage: false,
        customImageUpdatedAt: null,
        source: 'manual',
        externalCatalog: null,
        externalProductType: null,
        packageQuantity: null,
        packageUnit: null,
        nutrition: null,
      }
    },

    async listProducts(input): Promise<ProductRecord[]> {
      const search = input.search?.trim() ?? ''
      const normalizedSearch = search ? normalizeProductName(search) : ''

      const result = await db
        .prepare(
          `${productSelect('?1')}
           WHERE (p.household_id = ?1 OR p.household_id IS NULL)
             AND (?2 = '' OR p.normalized_name LIKE '%' || ?2 || '%')
           ORDER BY p.normalized_name ASC, p.name ASC`,
        )
        .bind(input.householdId, normalizedSearch)
        .all<ProductRow>()

      return result.results.map(toProduct)
    },

    async getReadableProduct(input): Promise<ProductRecord | null> {
      const row = await db
        .prepare(
          `${productSelect('?2')}
           WHERE p.id = ?1 AND (p.household_id = ?2 OR p.household_id IS NULL)`,
        )
        .bind(input.productId, input.householdId)
        .first<ProductRow>()

      return row ? toProduct(row) : null
    },

    async findReadableByBarcode(input): Promise<ProductRecord | null> {
      const barcode = validateBarcode(input.barcode)
      const householdRow = await db
        .prepare(`${productSelect('?2')} WHERE p.barcode = ?1 AND p.household_id = ?2`)
        .bind(barcode, input.householdId)
        .first<ProductRow>()

      if (householdRow) {
        return toProduct(householdRow)
      }

      const globalRow = await db
        .prepare(`${productSelect('?2')} WHERE p.barcode = ?1 AND p.household_id IS NULL`)
        .bind(barcode, input.householdId)
        .first<ProductRow>()

      return globalRow ? toProduct(globalRow) : null
    },

    async importExternalProduct(input): Promise<ProductRecord> {
      const barcode = validateBarcode(input.barcode)
      const existing = await db
        .prepare(`${productSelect(null)} WHERE p.barcode = ?1 AND p.household_id IS NULL`)
        .bind(barcode)
        .first<ProductRow>()

      if (existing) {
        await persistNutritionIfMissing(existing.id, input.nutrition, nowIso())
        return (await readById(existing.id)) ?? toProduct(existing)
      }

      const now = nowIso()
      const plan = planExternalProduct({
        id: newId(),
        barcode,
        catalog: input.catalog,
        productType: input.productType,
        name: input.name,
        brand: input.brand,
        unit: input.unit,
        imageUrl: input.imageUrl,
        packageQuantity: input.packageQuantity,
        packageUnit: input.packageUnit,
        now,
      })

      const statements = [
        db
          .prepare(
            `INSERT INTO products (
               id, household_id, barcode, name, normalized_name, brand, default_unit, source,
               image_url, external_catalog, external_product_type, package_quantity, package_unit,
               external_fetched_at, created_at, updated_at
             ) VALUES (?1, NULL, ?2, ?3, ?4, ?5, ?6, 'open_food_facts', ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13)`,
          )
          .bind(
            plan.id,
            plan.barcode,
            plan.name,
            plan.normalizedName,
            plan.brand,
            plan.defaultUnit,
            plan.imageUrl,
            plan.externalCatalog,
            plan.externalProductType,
            plan.packageQuantity,
            plan.packageUnit,
            plan.externalFetchedAt,
            plan.createdAt,
          ),
      ]

      if (input.nutrition && !isEmptyNutrition(input.nutrition)) {
        statements.push(
          db
            .prepare(
              `INSERT OR IGNORE INTO product_nutrition (
                 product_id, energy_kcal_100g, protein_g_100g, carbohydrates_g_100g, fat_g_100g,
                 sugars_g_100g, fiber_g_100g, salt_g_100g, serving_size,
                 energy_kcal_serving, protein_g_serving, carbohydrates_g_serving, fat_g_serving, updated_at
               ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`,
            )
            .bind(...nutritionBindValues(plan.id, input.nutrition, now)),
        )
      }

      try {
        await db.batch(statements)
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          throw error
        }

        const raced = await db
          .prepare(`${productSelect(null)} WHERE p.barcode = ?1 AND p.household_id IS NULL`)
          .bind(barcode)
          .first<ProductRow>()

        if (!raced) {
          throw error
        }

        await persistNutritionIfMissing(raced.id, input.nutrition, nowIso())
        return (await readById(raced.id)) ?? toProduct(raced)
      }

      return (await readById(plan.id)) ?? {
        id: plan.id,
        name: plan.name,
        brand: plan.brand,
        unit: plan.defaultUnit,
        barcode: plan.barcode,
        imageUrl: plan.imageUrl,
        hasCustomImage: false,
        customImageUpdatedAt: null,
        source: 'open_food_facts',
        externalCatalog: plan.externalCatalog,
        externalProductType: plan.externalProductType,
        packageQuantity: plan.packageQuantity,
        packageUnit: plan.packageUnit,
        nutrition: input.nutrition && !isEmptyNutrition(input.nutrition) ? input.nutrition : null,
      }
    },

    async updateManualProduct(input) {
      const row = await db
        .prepare(
          `${productSelect('?2')} WHERE p.id = ?1 AND p.household_id = ?2 AND p.source = 'manual'`,
        )
        .bind(input.productId, input.householdId)
        .first<ProductRow>()

      if (!row) {
        throw new DomainError('NOT_FOUND', 'Not found')
      }

      const hasName = input.name !== undefined
      const hasBrand = input.brand !== undefined
      const hasUnit = input.unit !== undefined
      if (!hasName && !hasBrand && !hasUnit) {
        throw new DomainError('INVALID_PRODUCT_NAME', 'Invalid product name')
      }

      if (hasName && typeof input.name !== 'string') {
        throw new DomainError('INVALID_PRODUCT_NAME', 'Invalid product name')
      }
      const name = hasName ? validateProductName(input.name as string).name : row.name
      const normalizedName = normalizeProductName(name)

      if (hasBrand && input.brand != null && typeof input.brand !== 'string') {
        throw new DomainError('INVALID_BRAND', 'Invalid brand')
      }
      const brand = hasBrand
        ? validateProductBrand(typeof input.brand === 'string' ? input.brand : null)
        : row.brand

      let unit = row.default_unit
      if (hasUnit) {
        if (typeof input.unit !== 'string') {
          throw new DomainError('INVALID_UNIT', 'Invalid unit')
        }
        unit = validateProductUnit(input.unit)
        if (unit !== row.default_unit) {
          const usage = await db
            .prepare(
              `SELECT (
                 (SELECT COUNT(*) FROM inventory_lots WHERE product_id = ?1)
                 + (SELECT COUNT(*) FROM inventory_history WHERE product_id = ?1)
                 + (SELECT COUNT(*) FROM shopping_items WHERE product_id = ?1 AND quantity IS NOT NULL)
                 + (SELECT COUNT(*) FROM recipe_ingredients WHERE product_id = ?1)
               ) AS n`,
            )
            .bind(row.id)
            .first<{ n: number }>()

          if ((usage?.n ?? 0) > 0) {
            throw new DomainError('UNIT_IMMUTABLE', 'Product unit cannot be changed')
          }
        }
      }

      await db
        .prepare(
          `UPDATE products
           SET name = ?1,
               normalized_name = ?2,
               brand = ?3,
               default_unit = ?4,
               updated_at = ?5
           WHERE id = ?6 AND household_id = ?7 AND source = 'manual'`,
        )
        .bind(name, normalizedName, brand, unit, nowIso(), row.id, input.householdId)
        .run()

      const updated = await readById(row.id, input.householdId)
      if (!updated) {
        throw new DomainError('NOT_FOUND', 'Not found')
      }

      return updated
    },

    async createHouseholdOverrideProduct(input) {
      const source = await db
        .prepare(
          `${productSelect('?2')} WHERE p.id = ?1 AND (p.household_id = ?2 OR p.household_id IS NULL)`,
        )
        .bind(input.sourceProductId, input.householdId)
        .first<ProductRow>()

      if (!source) {
        throw new DomainError('NOT_FOUND', 'Not found')
      }

      if (source.household_id === input.householdId) {
        throw new DomainError('UNIT_IMMUTABLE', 'Product unit cannot be changed')
      }

      if (!source.barcode) {
        throw new DomainError('INVALID_BARCODE', 'Invalid barcode')
      }

      const unit = validateProductUnit(input.unit)
      const existing = await db
        .prepare(`${productSelect('?2')} WHERE p.barcode = ?1 AND p.household_id = ?2`)
        .bind(source.barcode, input.householdId)
        .first<ProductRow>()

      if (existing) {
        if (existing.default_unit === unit) {
          return toProduct(existing)
        }

        const usage = await db
          .prepare(
            `SELECT (
               (SELECT COUNT(*) FROM inventory_lots WHERE product_id = ?1 AND household_id = ?2)
               + (SELECT COUNT(*) FROM inventory_history WHERE product_id = ?1 AND household_id = ?2)
               + (SELECT COUNT(*) FROM shopping_items WHERE product_id = ?1 AND household_id = ?2 AND quantity IS NOT NULL)
             ) AS n`,
          )
          .bind(existing.id, input.householdId)
          .first<{ n: number }>()

        if ((usage?.n ?? 0) > 0) {
          throw new DomainError('UNIT_IMMUTABLE', 'Product unit cannot be changed')
        }

        await db
          .prepare(
            `UPDATE products
             SET default_unit = ?1, updated_at = ?2
             WHERE id = ?3 AND household_id = ?4`,
          )
          .bind(unit, nowIso(), existing.id, input.householdId)
          .run()

        const updated = await readById(existing.id, input.householdId)
        if (!updated) {
          throw new DomainError('NOT_FOUND', 'Not found')
        }
        return updated
      }

      const now = nowIso()
      const id = newId()
      const name = validateProductName(source.name)
      try {
        await db
          .prepare(
            `INSERT INTO products (
               id, household_id, barcode, name, normalized_name, brand, default_unit, source,
               image_url, package_quantity, package_unit, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'manual', ?8, ?9, ?10, ?11, ?11)`,
          )
          .bind(
            id,
            input.householdId,
            source.barcode,
            name.name,
            name.normalizedName,
            source.brand,
            unit,
            source.image_url,
            source.package_quantity,
            source.package_unit,
            now,
          )
          .run()
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          throw error
        }

        const raced = await db
          .prepare(`${productSelect('?2')} WHERE p.barcode = ?1 AND p.household_id = ?2`)
          .bind(source.barcode, input.householdId)
          .first<ProductRow>()
        if (!raced) {
          throw error
        }
        return toProduct(raced)
      }

      const created = await readById(id, input.householdId)
      if (!created) {
        throw new DomainError('NOT_FOUND', 'Not found')
      }
      return created
    },

    async getHouseholdProductImage(input) {
      return readHouseholdImage(input.householdId, input.productId)
    },

    async upsertHouseholdProductImage(input) {
      const now = nowIso()
      await db
        .prepare(
          `INSERT INTO household_product_images (
             household_id, product_id, r2_key, content_type, created_by_user_id, created_at, updated_at
           ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
           ON CONFLICT(household_id, product_id) DO UPDATE SET
             r2_key = excluded.r2_key,
             content_type = excluded.content_type,
             created_by_user_id = excluded.created_by_user_id,
             updated_at = excluded.updated_at`,
        )
        .bind(
          input.householdId,
          input.productId,
          input.r2Key,
          input.contentType,
          input.createdByUserId,
          now,
        )
        .run()

      const saved = await readHouseholdImage(input.householdId, input.productId)
      if (!saved) {
        throw new DomainError('NOT_FOUND', 'Not found')
      }

      return saved
    },

    async deleteHouseholdProductImage(input) {
      const existing = await readHouseholdImage(input.householdId, input.productId)
      if (!existing) {
        return null
      }

      await db
        .prepare('DELETE FROM household_product_images WHERE household_id = ?1 AND product_id = ?2')
        .bind(input.householdId, input.productId)
        .run()

      return existing
    },
  }
}
