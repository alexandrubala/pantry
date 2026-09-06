import { Hono } from 'hono'
import {
  DomainError,
  httpStatusForDomainError,
  isDomainError,
  type HouseholdStore,
  type ShoppingStore,
} from '@pantry/core'
import { createD1HouseholdStore, createD1ShoppingStore } from '@pantry/database/d1'
import { requireAuth } from '../auth/authorize.js'
import { ensureProfile } from '../profiles/profile.js'

export const shopping = new Hono<{ Bindings: CloudflareBindings }>()

function householdStore(db: D1Database): HouseholdStore {
  return createD1HouseholdStore(db)
}

function shoppingStore(db: D1Database): ShoppingStore {
  return createD1ShoppingStore(db)
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
        error.code === 'SHOPPING_UNIT_CONFLICT'
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

  return { household, shopping: shoppingStore(env.DB) }
}

shopping.get('/shopping', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)

  try {
    const { household, shopping: store } = await requireActiveHousehold(c.env, user.id)
    const list = await store.getOrCreateActiveList({ householdId: household.id })
    return c.json({ list })
  } catch (error) {
    if (isDomainError(error)) {
      const mapped = domainResponse(error)
      return c.json(mapped.body, mapped.status)
    }
    throw error
  }
})

shopping.post('/shopping/items/product', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)

  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)
  }

  const body = readJsonObject(payload)
  if (!body || typeof body.productId !== 'string' || body.productId.trim() === '') {
    return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)
  }

  try {
    const { household, shopping: store } = await requireActiveHousehold(c.env, user.id)
    const item = await store.addProductItem({
      householdId: household.id,
      userId: user.id,
      productId: body.productId.trim(),
      quantity: body.quantity,
      unit: body.unit,
    })
    return c.json({ item })
  } catch (error) {
    if (isDomainError(error)) {
      const mapped = domainResponse(error)
      return c.json(mapped.body, mapped.status)
    }
    throw error
  }
})

shopping.post('/shopping/items', async (c) => {
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

  try {
    const { household, shopping: store } = await requireActiveHousehold(c.env, user.id)
    const item = await store.addManualItem({
      householdId: household.id,
      userId: user.id,
      name: body.name,
      quantity: body.quantity,
      unit: body.unit,
    })
    return c.json({ item })
  } catch (error) {
    if (isDomainError(error)) {
      const mapped = domainResponse(error)
      return c.json(mapped.body, mapped.status)
    }
    throw error
  }
})

shopping.patch('/shopping/items/:id', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)

  const itemId = c.req.param('id').trim()
  if (!itemId) {
    return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)
  }

  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid request' }, 400)
  }

  const body = readJsonObject(payload)
  if (!body || typeof body.checked !== 'boolean') {
    return c.json({ error: 'Invalid request' }, 400)
  }

  try {
    const { household, shopping: store } = await requireActiveHousehold(c.env, user.id)
    const item = await store.toggleItem({
      householdId: household.id,
      itemId,
      checked: body.checked,
    })
    return c.json({ item })
  } catch (error) {
    if (isDomainError(error)) {
      const mapped = domainResponse(error)
      return c.json(mapped.body, mapped.status)
    }
    throw error
  }
})

shopping.delete('/shopping/items/:id', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)

  const itemId = c.req.param('id').trim()
  if (!itemId) {
    return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)
  }

  try {
    const { household, shopping: store } = await requireActiveHousehold(c.env, user.id)
    await store.removeItem({ householdId: household.id, itemId })
    return c.body(null, 204)
  } catch (error) {
    if (isDomainError(error)) {
      const mapped = domainResponse(error)
      return c.json(mapped.body, mapped.status)
    }
    throw error
  }
})

shopping.post('/shopping/clear-completed', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)

  try {
    const { household, shopping: store } = await requireActiveHousehold(c.env, user.id)
    const list = await store.clearCompleted({ householdId: household.id })
    return c.json({ list })
  } catch (error) {
    if (isDomainError(error)) {
      const mapped = domainResponse(error)
      return c.json(mapped.body, mapped.status)
    }
    throw error
  }
})
