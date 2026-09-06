import { DomainError } from '../errors.js'
import { DEFAULT_LOCATIONS } from './defaults.js'
import { validateHouseholdName } from './names.js'

export type PlannedLocation = {
  id: string
  name: string
  normalizedName: string
  sortOrder: number
}

export type PlannedHouseholdCreation = {
  household: {
    id: string
    name: string
    createdAt: string
    updatedAt: string
  }
  membership: {
    householdId: string
    userId: string
    role: 'owner'
    createdAt: string
  }
  locations: PlannedLocation[]
  activeHouseholdId: string
}

export function planHouseholdCreation(input: {
  householdId: string
  userId: string
  name: string
  locationIds: readonly string[]
  now: string
}): PlannedHouseholdCreation {
  const name = validateHouseholdName(input.name)

  if (input.locationIds.length !== DEFAULT_LOCATIONS.length) {
    throw new Error('default location id count mismatch')
  }

  if (new Set(input.locationIds).size !== input.locationIds.length) {
    throw new Error('default location ids must be unique')
  }

  return {
    household: {
      id: input.householdId,
      name,
      createdAt: input.now,
      updatedAt: input.now,
    },
    membership: {
      householdId: input.householdId,
      userId: input.userId,
      role: 'owner',
      createdAt: input.now,
    },
    locations: DEFAULT_LOCATIONS.map((location, index) => {
      const id = input.locationIds[index]
      if (!id) {
        throw new Error('default location id missing')
      }

      return {
        id,
        name: location.name,
        normalizedName: location.normalizedName,
        sortOrder: location.sortOrder,
      }
    }),
    activeHouseholdId: input.householdId,
  }
}

export function selectFallbackHouseholdId(
  memberships: ReadonlyArray<{ householdId: string }>,
  currentActiveId: string | null,
): string | null {
  if (currentActiveId && memberships.some((membership) => membership.householdId === currentActiveId)) {
    return currentActiveId
  }

  return memberships[0]?.householdId ?? null
}

export function assertMemberAccess(membership: { userId: string } | null): asserts membership is {
  userId: string
} {
  if (!membership) {
    throw new DomainError('NOT_FOUND', 'Not found')
  }
}
