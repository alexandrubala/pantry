import type { HouseholdMembership, HouseholdRole } from '@pantry/core'
import { DomainError } from '@pantry/core'
import type { ProfileIdentity } from '../profiles/profile.js'
import { resolveCurrentUser } from './session.js'

export async function requireAuth(
  env: CloudflareBindings,
  request: Request,
): Promise<ProfileIdentity | null> {
  return resolveCurrentUser(env, request)
}

export function requireHouseholdMember(
  membership: HouseholdMembership | null,
): HouseholdMembership {
  if (!membership) {
    throw new DomainError('NOT_FOUND', 'Not found')
  }

  return membership
}

export function requireHouseholdOwner(
  membership: HouseholdMembership | null,
): HouseholdMembership {
  const current = requireHouseholdMember(membership)
  if (current.role !== ('owner' satisfies HouseholdRole)) {
    throw new DomainError('NOT_FOUND', 'Not found')
  }

  return current
}
