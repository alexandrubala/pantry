import { Hono } from 'hono'
import {
  DomainError,
  httpStatusForDomainError,
  isDomainError,
  type HouseholdStore,
  type ProductStore,
} from '@pantry/core'
import { createD1HouseholdStore, createD1ProductStore } from '@pantry/database/d1'
import { requireAuth } from '../auth/authorize.js'
import { ensureProfile } from '../profiles/profile.js'

export const products = new Hono<{ Bindings: CloudflareBindings }>()

function householdStore(db: D1Database): HouseholdStore {
  return createD1HouseholdStore(db)
}

function productStore(db: D1Database): ProductStore {
  return createD1ProductStore(db)
}

function readJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function domainResponse(error: DomainError) {
  return {
    body: {
      error:
        error.code === 'INSUFFICIENT_STOCK' ||
        error.code === 'STOCK_CONFLICT' ||
        error.code === 'INVENTORY_CHANGED' ||
        error.code === 'UNIT_IMMUTABLE'
          ? error.code
          : error.message,
      code: error.code,
      ...(error.available != null ? { available: error.available } : {}),
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

products.get('/products', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)

  try {
    const { household, products: store } = await requireActiveHousehold(c.env, user.id)
    const search = c.req.query('search') ?? null
    const list = await store.listProducts({ householdId: household.id, search })
    return c.json({ products: list })
  } catch (error) {
    if (isDomainError(error)) {
      const mapped = domainResponse(error)
      return c.json(mapped.body, mapped.status)
    }
    throw error
  }
})

products.post('/products', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)

  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid product name', code: 'INVALID_PRODUCT_NAME' }, 400)
  }

  const body = readJsonObject(payload)
  if (!body || typeof body.name !== 'string') {
    return c.json({ error: 'Invalid product name', code: 'INVALID_PRODUCT_NAME' }, 400)
  }

  if (typeof body.unit !== 'string') {
    return c.json({ error: 'Invalid unit', code: 'INVALID_UNIT' }, 400)
  }

  const brand = body.brand == null ? null : typeof body.brand === 'string' ? body.brand : null
  if (body.brand != null && typeof body.brand !== 'string') {
    return c.json({ error: 'Invalid brand', code: 'INVALID_BRAND' }, 400)
  }

  let barcode: string | null = null
  if (body.barcode != null) {
    if (typeof body.barcode !== 'string') {
      return c.json({ error: 'Invalid barcode', code: 'INVALID_BARCODE' }, 400)
    }
    barcode = body.barcode
  }

  try {
    const { household, products: store } = await requireActiveHousehold(c.env, user.id)
    const product = await store.createManualProduct({
      householdId: household.id,
      name: body.name,
      brand,
      unit: body.unit,
      barcode,
    })
    return c.json({ product }, 201)
  } catch (error) {
    if (isDomainError(error)) {
      const mapped = domainResponse(error)
      return c.json(mapped.body, mapped.status)
    }
    throw error
  }
})

products.patch('/products/:id', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)

  const productId = c.req.param('id').trim()
  if (!productId) {
    return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)
  }

  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid product name', code: 'INVALID_PRODUCT_NAME' }, 400)
  }

  const body = readJsonObject(payload)
  if (!body) {
    return c.json({ error: 'Invalid product name', code: 'INVALID_PRODUCT_NAME' }, 400)
  }

  try {
    const { household, products: store } = await requireActiveHousehold(c.env, user.id)
    const product = await store.updateManualProduct({
      householdId: household.id,
      productId,
      name: body.name,
      brand: body.brand,
      unit: body.unit,
    })
    return c.json({ product })
  } catch (error) {
    if (isDomainError(error)) {
      const mapped = domainResponse(error)
      return c.json(mapped.body, mapped.status)
    }
    throw error
  }
})
