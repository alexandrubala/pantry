import {
  DEFAULT_LOCATIONS,
  DomainError,
  nextLocationSortOrder,
  planHouseholdCreation,
  selectFallbackHouseholdId,
  validateHouseholdName,
  validateLocationName,
  type ActiveHousehold,
  type CreateHouseholdResult,
  type HouseholdMembership,
  type HouseholdRole,
  type HouseholdStore,
  type HouseholdSummary,
  type LocationRecord,
} from '@pantry/core'
import type { D1DatabaseLike } from './d1-like.js'

type LocationRow = {
  id: string
  name: string
  sort_order: number
}

type MembershipRow = {
  household_id: string
  name: string
  role: HouseholdRole
}

type MaxSortRow = {
  max_sort: number | null
}

function isUniqueConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  return /UNIQUE constraint failed/i.test(error.message)
}

function newId(): string {
  return crypto.randomUUID()
}

function nowIso(): string {
  return new Date().toISOString()
}

export function createD1HouseholdStore(db: D1DatabaseLike): HouseholdStore {
  async function listMemberships(userId: string): Promise<HouseholdMembership[]> {
    const result = await db
      .prepare(
        `SELECT m.household_id AS household_id, h.name AS name, m.role AS role
         FROM household_members m
         INNER JOIN households h ON h.id = m.household_id
         WHERE m.user_id = ?1
         ORDER BY h.created_at ASC, h.name ASC`,
      )
      .bind(userId)
      .all<MembershipRow>()

    return result.results.map((row) => ({
      householdId: row.household_id,
      name: row.name,
      role: row.role,
    }))
  }

  async function readActiveHouseholdId(userId: string): Promise<string | null> {
    const row = await db
      .prepare(`SELECT active_household_id FROM profiles WHERE id = ?1`)
      .bind(userId)
      .first<{ active_household_id: string | null }>()

    return row?.active_household_id ?? null
  }

  async function writeActiveHouseholdId(userId: string, householdId: string | null): Promise<void> {
    await db
      .prepare(`UPDATE profiles SET active_household_id = ?1, updated_at = ?2 WHERE id = ?3`)
      .bind(householdId, nowIso(), userId)
      .run()
  }

  async function membershipFor(
    userId: string,
    householdId: string,
  ): Promise<HouseholdMembership | null> {
    const row = await db
      .prepare(
        `SELECT m.household_id AS household_id, h.name AS name, m.role AS role
         FROM household_members m
         INNER JOIN households h ON h.id = m.household_id
         WHERE m.user_id = ?1 AND m.household_id = ?2`,
      )
      .bind(userId, householdId)
      .first<MembershipRow>()

    if (!row) {
      return null
    }

    return {
      householdId: row.household_id,
      name: row.name,
      role: row.role,
    }
  }

  return {
    async createHouseholdWithOwnerAndLocations(input): Promise<CreateHouseholdResult> {
      const name = validateHouseholdName(input.name)
      const plan = planHouseholdCreation({
        householdId: newId(),
        userId: input.userId,
        name,
        locationIds: DEFAULT_LOCATIONS.map(() => newId()),
        now: nowIso(),
      })

      const statements = [
        db
          .prepare(
            `INSERT INTO households (id, name, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?3)`,
          )
          .bind(plan.household.id, plan.household.name, plan.household.createdAt),
        db
          .prepare(
            `INSERT INTO household_members (household_id, user_id, role, created_at)
             VALUES (?1, ?2, ?3, ?4)`,
          )
          .bind(
            plan.membership.householdId,
            plan.membership.userId,
            plan.membership.role,
            plan.membership.createdAt,
          ),
        ...plan.locations.map((location) =>
          db
            .prepare(
              `INSERT INTO locations (
                 id, household_id, name, normalized_name, sort_order, is_active, created_at, updated_at
               ) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?6)`,
            )
            .bind(
              location.id,
              plan.household.id,
              location.name,
              location.normalizedName,
              location.sortOrder,
              plan.household.createdAt,
            ),
        ),
        db
          .prepare(
            `INSERT INTO profiles (id, display_name, avatar_url, locale, created_at, updated_at, active_household_id)
             VALUES (?1, ?2, NULL, 'ro', ?3, ?3, ?4)
             ON CONFLICT(id) DO UPDATE SET
               active_household_id = excluded.active_household_id,
               updated_at = excluded.updated_at`,
          )
          .bind(
            input.userId,
            input.ownerDisplayName,
            plan.household.createdAt,
            plan.activeHouseholdId,
          ),
      ]

      await db.batch(statements)

      return {
        household: {
          id: plan.household.id,
          name: plan.household.name,
          role: 'owner',
        },
        locations: plan.locations.map((location) => ({
          id: location.id,
          name: location.name,
          sortOrder: location.sortOrder,
        })),
      }
    },

    async listForUser(userId): Promise<HouseholdSummary[]> {
      const activeId = await readActiveHouseholdId(userId)
      const memberships = await listMemberships(userId)

      return memberships.map((membership) => ({
        id: membership.householdId,
        name: membership.name,
        role: membership.role,
        isActive: membership.householdId === activeId,
      }))
    },

    async getMembership(userId, householdId): Promise<HouseholdMembership | null> {
      return membershipFor(userId, householdId)
    },

    async getActiveHousehold(userId): Promise<ActiveHousehold | null> {
      const memberships = await listMemberships(userId)
      const currentActiveId = await readActiveHouseholdId(userId)
      const nextActiveId = selectFallbackHouseholdId(memberships, currentActiveId)

      if (nextActiveId !== currentActiveId) {
        await writeActiveHouseholdId(userId, nextActiveId)
      }

      if (!nextActiveId) {
        return null
      }

      const membership = memberships.find((item) => item.householdId === nextActiveId)
      if (!membership) {
        return null
      }

      return {
        id: membership.householdId,
        name: membership.name,
        role: membership.role,
      }
    },

    async setActiveHousehold(userId, householdId): Promise<void> {
      const membership = await membershipFor(userId, householdId)
      if (!membership) {
        throw new DomainError('NOT_FOUND', 'Not found')
      }

      await writeActiveHouseholdId(userId, householdId)
    },

    async listActiveLocations(householdId): Promise<LocationRecord[]> {
      const result = await db
        .prepare(
          `SELECT id, name, sort_order
           FROM locations
           WHERE household_id = ?1 AND is_active = 1
           ORDER BY sort_order ASC, name ASC`,
        )
        .bind(householdId)
        .all<LocationRow>()

      return result.results.map((row) => ({
        id: row.id,
        name: row.name,
        sortOrder: row.sort_order,
      }))
    },

    async createLocation(input): Promise<LocationRecord> {
      const { name, normalizedName } = validateLocationName(input.name)
      const now = nowIso()

      const maxRow = await db
        .prepare(`SELECT MAX(sort_order) AS max_sort FROM locations WHERE household_id = ?1`)
        .bind(input.householdId)
        .first<MaxSortRow>()

      const location: LocationRecord = {
        id: newId(),
        name,
        sortOrder: nextLocationSortOrder(maxRow?.max_sort ?? null),
      }

      try {
        await db
          .prepare(
            `INSERT INTO locations (
               id, household_id, name, normalized_name, sort_order, is_active, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?6)`,
          )
          .bind(
            location.id,
            input.householdId,
            location.name,
            normalizedName,
            location.sortOrder,
            now,
          )
          .run()
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new DomainError('LOCATION_NAME_TAKEN', 'Location name already exists')
        }

        throw error
      }

      return location
    },
  }
}
