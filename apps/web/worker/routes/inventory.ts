import { Hono } from 'hono'
import {
  DomainError,
  EXPIRING_SOON_DAYS,
  httpStatusForDomainError,
  isDomainError,
  parseRequiredIsoDate,
  utcIsoDate,
  type HouseholdStore,
  type InventoryStore,
} from '@pantry/core'
import { createD1HouseholdStore, createD1InventoryStore } from '@pantry/database/d1'
import { requireAuth } from '../auth/authorize.js'
import { ensureProfile } from '../profiles/profile.js'

export const inventory = new Hono<{ Bindings: CloudflareBindings }>()

function householdStore(db: D1Database): HouseholdStore {
  return createD1HouseholdStore(db)
}

function inventoryStore(db: D1Database): InventoryStore {
  return createD1InventoryStore(db)
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
        error.code === 'INVENTORY_CHANGED'
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

  return { household, inventory: inventoryStore(env.DB) }
}

function parseTodayParam(value: string | undefined): string {
  if (value == null || value.trim() === '') {
    return utcIsoDate()
  }

  return parseRequiredIsoDate(value)
}

function parseDaysParam(value: string | undefined): number {
  if (value == null || value.trim() === '') {
    return EXPIRING_SOON_DAYS
  }

  if (!/^\d+$/.test(value.trim())) {
    throw new DomainError('INVALID_EXPIRY', 'Invalid days window')
  }

  const days = Number(value)
  if (!Number.isInteger(days) || days < 1) {
    throw new DomainError('INVALID_EXPIRY', 'Invalid days window')
  }

  return Math.min(days, 30)
}

inventory.get('/inventory', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)

  try {
    const { household, inventory: store } = await requireActiveHousehold(c.env, user.id)
    const search = c.req.query('search') ?? null
    const locationId = c.req.query('locationId') ?? null
    const items = await store.getInventory({
      householdId: household.id,
      search,
      locationId,
    })
    return c.json({ items })
  } catch (error) {
    if (isDomainError(error)) {
      const mapped = domainResponse(error)
      return c.json(mapped.body, mapped.status)
    }
    throw error
  }
})

inventory.get('/inventory/summary', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)

  try {
    const { household, inventory: store } = await requireActiveHousehold(c.env, user.id)
    const summary = await store.getSummary({
      householdId: household.id,
      today: parseTodayParam(c.req.query('today')),
    })
    return c.json(summary)
  } catch (error) {
    if (isDomainError(error)) {
      const mapped = domainResponse(error)
      return c.json(mapped.body, mapped.status)
    }
    throw error
  }
})

inventory.get('/inventory/expiring', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)

  try {
    const { household, inventory: store } = await requireActiveHousehold(c.env, user.id)
    const lots = await store.listExpiring({
      householdId: household.id,
      today: parseTodayParam(c.req.query('today')),
      days: parseDaysParam(c.req.query('days')),
    })
    return c.json({ lots })
  } catch (error) {
    if (isDomainError(error)) {
      const mapped = domainResponse(error)
      return c.json(mapped.body, mapped.status)
    }
    throw error
  }
})

inventory.get('/inventory/history', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)

  try {
    const { household, inventory: store } = await requireActiveHousehold(c.env, user.id)
    const productId = c.req.query('productId') ?? null
    const entries = await store.listHistory({
      householdId: household.id,
      productId,
    })
    return c.json({ history: entries })
  } catch (error) {
    if (isDomainError(error)) {
      const mapped = domainResponse(error)
      return c.json(mapped.body, mapped.status)
    }
    throw error
  }
})

inventory.put('/inventory/settings/:productId', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)

  const productId = c.req.param('productId').trim()
  if (!productId) {
    return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)
  }

  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid quantity', code: 'INVALID_QUANTITY' }, 400)
  }

  const body = readJsonObject(payload)
  if (!body || !('minimumQuantity' in body)) {
    return c.json({ error: 'Invalid quantity', code: 'INVALID_QUANTITY' }, 400)
  }

  try {
    const { household, inventory: store } = await requireActiveHousehold(c.env, user.id)
    const settings = await store.setMinimumQuantity({
      householdId: household.id,
      productId,
      minimumQuantity: body.minimumQuantity,
    })
    return c.json({ settings })
  } catch (error) {
    if (isDomainError(error)) {
      const mapped = domainResponse(error)
      return c.json(mapped.body, mapped.status)
    }
    throw error
  }
})

inventory.post('/inventory/stock', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)

  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid quantity', code: 'INVALID_QUANTITY' }, 400)
  }

  const body = readJsonObject(payload)
  if (!body || typeof body.productId !== 'string' || body.productId.trim() === '') {
    return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)
  }

  if (typeof body.locationId !== 'string' || body.locationId.trim() === '') {
    return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)
  }

  try {
    const { household, inventory: store } = await requireActiveHousehold(c.env, user.id)
    const item = await store.addStock({
      householdId: household.id,
      userId: user.id,
      productId: body.productId.trim(),
      locationId: body.locationId.trim(),
      quantity: body.quantity,
      expiresOn: body.expiresOn,
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

inventory.post('/inventory/consume', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)

  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid quantity', code: 'INVALID_QUANTITY' }, 400)
  }

  const body = readJsonObject(payload)
  if (!body || typeof body.productId !== 'string' || body.productId.trim() === '') {
    return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)
  }

  try {
    const { household, inventory: store } = await requireActiveHousehold(c.env, user.id)
    const consumed = await store.consume({
      householdId: household.id,
      userId: user.id,
      productId: body.productId.trim(),
      quantity: body.quantity,
    })
    return c.json({ item: consumed.item })
  } catch (error) {
    if (isDomainError(error)) {
      const mapped = domainResponse(error)
      return c.json(mapped.body, mapped.status)
    }
    throw error
  }
})

inventory.post('/inventory/adjust', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)

  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid quantity', code: 'INVALID_QUANTITY' }, 400)
  }

  const body = readJsonObject(payload)
  if (!body || typeof body.lotId !== 'string' || body.lotId.trim() === '') {
    return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)
  }

  try {
    const { household, inventory: store } = await requireActiveHousehold(c.env, user.id)
    const item = await store.adjustLot({
      householdId: household.id,
      userId: user.id,
      lotId: body.lotId.trim(),
      expectedQuantity: body.expectedQuantity,
      quantity: body.quantity,
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

inventory.patch('/inventory/lots/:id', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)

  const lotId = c.req.param('id').trim()
  if (!lotId) {
    return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)
  }

  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid quantity', code: 'INVALID_QUANTITY' }, 400)
  }

  const body = readJsonObject(payload)
  const expected = body ? readJsonObject(body.expected) : null
  if (
    !body ||
    !expected ||
    !('quantity' in expected) ||
    !('locationId' in expected) ||
    !('expiresOn' in expected) ||
    !('quantity' in body) ||
    !('locationId' in body) ||
    !('expiresOn' in body)
  ) {
    return c.json({ error: 'Invalid quantity', code: 'INVALID_QUANTITY' }, 400)
  }

  try {
    const { household, inventory: store } = await requireActiveHousehold(c.env, user.id)
    const item = await store.updateLot({
      householdId: household.id,
      userId: user.id,
      lotId,
      expected: {
        quantity: expected.quantity,
        locationId: expected.locationId,
        expiresOn: expected.expiresOn,
      },
      quantity: body.quantity,
      locationId: body.locationId,
      expiresOn: body.expiresOn,
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

inventory.post('/inventory/move', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)

  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 400)
  }

  const body = readJsonObject(payload)
  if (!body || typeof body.lotId !== 'string' || body.lotId.trim() === '') {
    return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)
  }

  if (typeof body.locationId !== 'string' || body.locationId.trim() === '') {
    return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)
  }

  try {
    const { household, inventory: store } = await requireActiveHousehold(c.env, user.id)
    const item = await store.moveLot({
      householdId: household.id,
      userId: user.id,
      lotId: body.lotId.trim(),
      locationId: body.locationId.trim(),
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
