import { Hono } from 'hono'
import {
  DomainError,
  assertInviteAcceptable,
  deriveInviteStatus,
  generateInviteToken,
  hashInviteToken,
  httpStatusForDomainError,
  inviteExpiresAt,
  isDomainError,
  requireInviteToken,
  type HouseholdSharingStore,
  type HouseholdStore,
} from '@pantry/core'
import { createD1HouseholdSharingStore, createD1HouseholdStore } from '@pantry/database/d1'
import { requireAuth } from '../auth/authorize.js'
import { ensureProfile } from '../profiles/profile.js'

export const householdSharing = new Hono<{ Bindings: CloudflareBindings }>()

function householdStore(db: D1Database): HouseholdStore {
  return createD1HouseholdStore(db)
}

function sharingStore(db: D1Database): HouseholdSharingStore {
  return createD1HouseholdSharingStore(db)
}

function nowIso(): string {
  return new Date().toISOString()
}

function domainResponse(error: DomainError) {
  return {
    body: { error: error.message, code: error.code },
    status: httpStatusForDomainError(error.code),
  }
}

async function requireActiveHousehold(env: CloudflareBindings, userId: string) {
  const households = householdStore(env.DB)
  const household = await households.getActiveHousehold(userId)
  if (!household) {
    throw new DomainError('HOUSEHOLD_REQUIRED', 'Household setup required')
  }

  return { household, sharing: sharingStore(env.DB) }
}

householdSharing.post('/household/invites', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)

  try {
    const { household, sharing } = await requireActiveHousehold(c.env, user.id)
    const now = nowIso()
    const token = generateInviteToken()
    const tokenHash = await hashInviteToken(token)
    const created = await sharing.createInvite({
      householdId: household.id,
      actorUserId: user.id,
      tokenHash,
      now,
      expiresAt: inviteExpiresAt(now),
    })
    return c.json(
      {
        invite: {
          id: created.id,
          token,
          expiresAt: created.expiresAt,
        },
      },
      201,
    )
  } catch (error) {
    if (isDomainError(error)) {
      const mapped = domainResponse(error)
      return c.json(mapped.body, mapped.status)
    }
    throw error
  }
})

householdSharing.get('/household/invites', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)

  try {
    const { household, sharing } = await requireActiveHousehold(c.env, user.id)
    const invites = await sharing.listInvites({
      householdId: household.id,
      actorUserId: user.id,
      now: nowIso(),
    })
    return c.json({ invites })
  } catch (error) {
    if (isDomainError(error)) {
      const mapped = domainResponse(error)
      return c.json(mapped.body, mapped.status)
    }
    throw error
  }
})

householdSharing.delete('/household/invites/:id', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)

  try {
    const { household, sharing } = await requireActiveHousehold(c.env, user.id)
    await sharing.revokeInvite({
      householdId: household.id,
      actorUserId: user.id,
      inviteId: c.req.param('id'),
      now: nowIso(),
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

householdSharing.get('/household/members', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)

  try {
    const { household, sharing } = await requireActiveHousehold(c.env, user.id)
    const members = await sharing.listMembers({
      householdId: household.id,
      actorUserId: user.id,
    })
    return c.json({
      members: members.map((member) => ({
        userId: member.userId,
        name: member.name,
        email: member.email,
        role: member.role,
        isCurrentUser: member.userId === user.id,
      })),
    })
  } catch (error) {
    if (isDomainError(error)) {
      const mapped = domainResponse(error)
      return c.json(mapped.body, mapped.status)
    }
    throw error
  }
})

householdSharing.delete('/household/members/:userId', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)

  try {
    const { household, sharing } = await requireActiveHousehold(c.env, user.id)
    await sharing.removeMember({
      householdId: household.id,
      actorUserId: user.id,
      memberUserId: c.req.param('userId'),
      now: nowIso(),
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

householdSharing.post('/household/leave', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)

  try {
    const { household, sharing } = await requireActiveHousehold(c.env, user.id)
    await sharing.leaveHousehold({
      householdId: household.id,
      userId: user.id,
      now: nowIso(),
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

householdSharing.get('/invites/:token', async (c) => {
  try {
    const token = requireInviteToken(c.req.param('token'))
    const invite = await sharingStore(c.env.DB).getInviteByTokenHash(await hashInviteToken(token))
    if (!invite) {
      throw new DomainError('NOT_FOUND', 'Not found')
    }

    const status = deriveInviteStatus(invite, nowIso())
    assertInviteAcceptable(status)
    return c.json({
      valid: true,
      householdName: invite.householdName,
      expiresAt: invite.expiresAt,
    })
  } catch (error) {
    if (isDomainError(error)) {
      const mapped = domainResponse(error)
      const body =
        error.code === 'NOT_FOUND'
          ? mapped.body
          : { valid: false, error: mapped.body.error, code: mapped.body.code }
      return c.json(body, mapped.status)
    }
    throw error
  }
})

householdSharing.post('/invites/:token/accept', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)

  try {
    const token = requireInviteToken(c.req.param('token'))
    const household = await sharingStore(c.env.DB).acceptInvite({
      tokenHash: await hashInviteToken(token),
      userId: user.id,
      now: nowIso(),
    })
    return c.json({ household })
  } catch (error) {
    if (isDomainError(error)) {
      const mapped = domainResponse(error)
      return c.json(mapped.body, mapped.status)
    }
    throw error
  }
})
