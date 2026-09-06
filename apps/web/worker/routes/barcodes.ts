import { Hono } from 'hono'
import {
  DomainError,
  httpStatusForDomainError,
  isDomainError,
  validateBarcode,
  type ExternalProduct,
  type HouseholdStore,
  type ProductRecord,
  type ProductStore,
} from '@pantry/core'
import { createD1HouseholdStore, createD1ProductStore } from '@pantry/database/d1'
import { requireAuth } from '../auth/authorize.js'
import { lookupOpenFactsProduct } from '../catalog/open-facts.js'
import { ensureProfile } from '../profiles/profile.js'

export const barcodes = new Hono<{ Bindings: CloudflareBindings }>()

function householdStore(db: D1Database): HouseholdStore {
  return createD1HouseholdStore(db)
}

function productStore(db: D1Database): ProductStore {
  return createD1ProductStore(db)
}

function domainResponse(error: DomainError) {
  return {
    body: {
      error: error.message,
      code: error.code,
    },
    status: httpStatusForDomainError(error.code),
  }
}

async function requireActiveHousehold(env: CloudflareBindings, userId: string) {
  const households = householdStore(env.DB)
  const household = await households.getActiveHousehold(userId)
  if (!household) {
    throw new DomainError('HOUSEHOLD_REQUIRED', 'Household setup required')
  }

  return { household, products: productStore(env.DB) }
}

function toExternalPreview(product: ExternalProduct) {
  return {
    barcode: product.barcode,
    catalog: product.catalog,
    productType: product.productType,
    name: product.name,
    brand: product.brand,
    imageUrl: product.imageUrl,
    quantityText: product.quantityText,
    packageQuantity: product.packageQuantity,
    packageUnit: product.packageUnit,
    packageQuantityConfident: product.packageQuantityConfident,
    unit: product.unit,
    nutrition: product.nutrition,
  }
}

function toApiProduct(product: ProductRecord) {
  return {
    id: product.id,
    name: product.name,
    brand: product.brand,
    unit: product.unit,
    barcode: product.barcode,
    imageUrl: product.imageUrl,
    source: product.source,
    externalCatalog: product.externalCatalog,
    externalProductType: product.externalProductType,
    packageQuantity: product.packageQuantity,
    packageUnit: product.packageUnit,
    nutrition: product.nutrition,
  }
}

barcodes.get('/barcodes/:barcode', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)

  try {
    const barcode = validateBarcode(c.req.param('barcode'))
    const { household, products } = await requireActiveHousehold(c.env, user.id)
    const existing = await products.findReadableByBarcode({ householdId: household.id, barcode })
    if (existing) {
      return c.json({ status: 'existing', product: toApiProduct(existing) })
    }

    const lookup = await lookupOpenFactsProduct(barcode)
    if (lookup.status === 'temporary_failure') {
      return c.json(
        {
          error: 'Catalog temporarily unavailable',
          code: 'CATALOG_UNAVAILABLE',
          barcode,
        },
        503,
      )
    }

    if (lookup.status === 'found') {
      return c.json({ status: 'external', product: toExternalPreview(lookup.product) })
    }

    return c.json({ status: 'not_found', barcode })
  } catch (error) {
    if (isDomainError(error)) {
      const mapped = domainResponse(error)
      return c.json(mapped.body, mapped.status)
    }
    throw error
  }
})

barcodes.post('/barcodes/:barcode/import', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)

  try {
    const barcode = validateBarcode(c.req.param('barcode'))
    const { household, products } = await requireActiveHousehold(c.env, user.id)
    const existing = await products.findReadableByBarcode({ householdId: household.id, barcode })
    if (existing?.externalCatalog) {
      return c.json({ product: toApiProduct(existing) })
    }

    const lookup = await lookupOpenFactsProduct(barcode)
    if (lookup.status === 'temporary_failure') {
      return c.json(
        {
          error: 'Catalog temporarily unavailable',
          code: 'CATALOG_UNAVAILABLE',
          barcode,
        },
        503,
      )
    }

    if (lookup.status !== 'found') {
      throw new DomainError('NOT_FOUND', 'Not found')
    }

    const imported = await products.importExternalProduct({
      barcode,
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

    return c.json({ product: toApiProduct(imported) }, 201)
  } catch (error) {
    if (isDomainError(error)) {
      const mapped = domainResponse(error)
      return c.json(mapped.body, mapped.status)
    }
    throw error
  }
})
