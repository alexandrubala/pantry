import { Hono } from 'hono'
import {
  DomainError,
  httpStatusForDomainError,
  isDomainError,
  type HouseholdStore,
} from '@pantry/core'
import { createD1HouseholdStore } from '@pantry/database/d1'
import { requireAuth, requireHouseholdMember } from '../auth/authorize.js'
import { ensureProfile } from '../profiles/profile.js'

export const households = new Hono<{ Bindings: CloudflareBindings }>()

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

households.get('/households', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)
  const list = await storeFor(c.env.DB).listForUser(user.id)
  return c.json({ households: list })
})

households.post('/households', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid household name', code: 'INVALID_HOUSEHOLD_NAME' }, 400)
  }

  const body = readJsonObject(payload)
  if (!body || typeof body.name !== 'string') {
    return c.json({ error: 'Invalid household name', code: 'INVALID_HOUSEHOLD_NAME' }, 400)
  }

  try {
    const created = await storeFor(c.env.DB).createHouseholdWithOwnerAndLocations({
      userId: user.id,
      name: body.name,
      ownerDisplayName: user.name,
    })
    return c.json({ household: created.household }, 201)
  } catch (error) {
    if (isDomainError(error)) {
      const mapped = domainResponse(error)
      return c.json(mapped.body, mapped.status)
    }
    throw error
  }
})

households.get('/household', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)
  const household = await storeFor(c.env.DB).getActiveHousehold(user.id)
  return c.json({ household })
})

households.put('/household/active', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return c.json({ error: 'Not found' }, 404)
  }

  const body = readJsonObject(payload)
  if (!body || typeof body.householdId !== 'string' || body.householdId.trim() === '') {
    return c.json({ error: 'Not found' }, 404)
  }

  const dbStore = storeFor(c.env.DB)
  try {
    const membership = requireHouseholdMember(
      await dbStore.getMembership(user.id, body.householdId.trim()),
    )
    await dbStore.setActiveHousehold(user.id, membership.householdId)
    return c.json({
      household: {
        id: membership.householdId,
        name: membership.name,
        role: membership.role,
      },
    })
  } catch (error) {
    if (isDomainError(error)) {
      const mapped = domainResponse(error)
      return c.json(mapped.body, mapped.status)
    }
    throw error
  }
})
