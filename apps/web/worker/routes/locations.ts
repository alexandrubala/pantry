import { Hono } from 'hono'
import {
  DomainError,
  httpStatusForDomainError,
  isDomainError,
  type HouseholdStore,
} from '@pantry/core'
import { createD1HouseholdStore } from '@pantry/database/d1'
import { requireAuth } from '../auth/authorize.js'
import { ensureProfile } from '../profiles/profile.js'

export const locations = new Hono<{ Bindings: CloudflareBindings }>()

function storeFor(db: D1Database): HouseholdStore {
  return createD1HouseholdStore(db)
}

function readJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function domainResponse(error: DomainError) {
  return {
    body: { error: error.message, code: error.code },
    status: httpStatusForDomainError(error.code),
  }
}

async function requireActiveHousehold(env: CloudflareBindings, userId: string) {
  const store = storeFor(env.DB)
  const household = await store.getActiveHousehold(userId)
  if (!household) {
    throw new DomainError('HOUSEHOLD_REQUIRED', 'Household setup required')
  }

  return { store, household }
}

locations.get('/locations', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)

  try {
    const { store, household } = await requireActiveHousehold(c.env, user.id)
    const list = await store.listActiveLocations(household.id)
    return c.json({ locations: list })
  } catch (error) {
    if (isDomainError(error)) {
      const mapped = domainResponse(error)
      return c.json(mapped.body, mapped.status)
    }
    throw error
  }
})

locations.post('/locations', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)

  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid location name', code: 'INVALID_LOCATION_NAME' }, 400)
  }

  const body = readJsonObject(payload)
  if (!body || typeof body.name !== 'string') {
    return c.json({ error: 'Invalid location name', code: 'INVALID_LOCATION_NAME' }, 400)
  }

  try {
    const { store, household } = await requireActiveHousehold(c.env, user.id)
    const location = await store.createLocation({
      householdId: household.id,
      name: body.name,
    })
    return c.json({ location }, 201)
  } catch (error) {
    if (isDomainError(error)) {
      const mapped = domainResponse(error)
      return c.json(mapped.body, mapped.status)
    }
    throw error
  }
})

locations.patch('/locations/:id', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)

  const locationId = c.req.param('id')?.trim()
  if (!locationId) {
    return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)
  }

  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid location name', code: 'INVALID_LOCATION_NAME' }, 400)
  }

  const body = readJsonObject(payload)
  if (!body || typeof body.name !== 'string') {
    return c.json({ error: 'Invalid location name', code: 'INVALID_LOCATION_NAME' }, 400)
  }

  try {
    const { store, household } = await requireActiveHousehold(c.env, user.id)
    const location = await store.renameLocation({
      householdId: household.id,
      locationId,
      name: body.name,
    })
    return c.json({ location })
  } catch (error) {
    if (isDomainError(error)) {
      const mapped = domainResponse(error)
      return c.json(mapped.body, mapped.status)
    }
    throw error
  }
})

locations.delete('/locations/:id', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)

  const locationId = c.req.param('id')?.trim()
  if (!locationId) {
    return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)
  }

  try {
    const { store, household } = await requireActiveHousehold(c.env, user.id)
    await store.deactivateLocation({
      householdId: household.id,
      locationId,
    })
    return c.body(null, 204)
  } catch (error) {
    if (isDomainError(error)) {
      const mapped = domainResponse(error)
      return c.json(mapped.body, mapped.status)
    }
    throw error
  }
})
