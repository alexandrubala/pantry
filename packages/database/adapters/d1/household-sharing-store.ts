import {
  DomainError,
  assertHouseholdMember,
  assertHouseholdOwner,
  assertInviteAcceptable,
  deriveInviteStatus,
  type ActiveHousehold,
  type CreatedHouseholdInvite,
  type HouseholdInviteRecord,
  type HouseholdInviteSummary,
  type HouseholdMemberRecord,
  type HouseholdMembership,
  type HouseholdRole,
  type HouseholdSharingStore,
} from '@pantry/core'
import type { D1DatabaseLike } from './d1-like.js'

type MembershipRow = {
  household_id: string
  name: string
  role: HouseholdRole
}

type InviteRow = {
  id: string
  household_id: string
  household_name: string
  token_hash: string
  role: 'member'
  expires_at: string
  accepted_at: string | null
  revoked_at: string | null
  accepted_by_user_id: string | null
  created_by_user_id: string
  created_at: string
}

type MemberRow = {
  user_id: string
  name: string
  email: string
  role: HouseholdRole
}

function newId(): string {
  return crypto.randomUUID()
}

function toInviteRecord(row: InviteRow): HouseholdInviteRecord {
  return {
    id: row.id,
    householdId: row.household_id,
    householdName: row.household_name,
    tokenHash: row.token_hash,
    role: row.role,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at,
    acceptedByUserId: row.accepted_by_user_id,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
  }
}

export function createD1HouseholdSharingStore(db: D1DatabaseLike): HouseholdSharingStore {
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

  async function requireMember(userId: string, householdId: string): Promise<HouseholdMembership> {
    const membership = await membershipFor(userId, householdId)
    assertHouseholdMember(membership)
    return membership
  }

  async function requireOwner(userId: string, householdId: string): Promise<HouseholdMembership> {
    const membership = await membershipFor(userId, householdId)
    assertHouseholdOwner(membership)
    return membership
  }

  async function readInviteByHash(tokenHash: string): Promise<HouseholdInviteRecord | null> {
    const row = await db
      .prepare(
        `SELECT
           i.id AS id,
           i.household_id AS household_id,
           h.name AS household_name,
           i.token_hash AS token_hash,
           i.role AS role,
           i.expires_at AS expires_at,
           i.accepted_at AS accepted_at,
           i.revoked_at AS revoked_at,
           i.accepted_by_user_id AS accepted_by_user_id,
           i.created_by_user_id AS created_by_user_id,
           i.created_at AS created_at
         FROM invites i
         INNER JOIN households h ON h.id = i.household_id
         WHERE i.token_hash = ?1`,
      )
      .bind(tokenHash)
      .first<InviteRow>()

    return row ? toInviteRecord(row) : null
  }

  async function writeActiveHouseholdId(
    userId: string,
    householdId: string | null,
    now: string,
  ): Promise<void> {
    await db
      .prepare(`UPDATE profiles SET active_household_id = ?1, updated_at = ?2 WHERE id = ?3`)
      .bind(householdId, now, userId)
      .run()
  }

  return {
    async createInvite(input): Promise<CreatedHouseholdInvite> {
      await requireOwner(input.actorUserId, input.householdId)
      const id = newId()

      await db
        .prepare(
          `INSERT INTO invites (
             id, household_id, token_hash, role, expires_at, accepted_at, revoked_at,
             accepted_by_user_id, created_by_user_id, created_at
           ) VALUES (?1, ?2, ?3, 'member', ?4, NULL, NULL, NULL, ?5, ?6)`,
        )
        .bind(id, input.householdId, input.tokenHash, input.expiresAt, input.actorUserId, input.now)
        .run()

      return { id, expiresAt: input.expiresAt }
    },

    async listInvites(input): Promise<HouseholdInviteSummary[]> {
      await requireOwner(input.actorUserId, input.householdId)
      const result = await db
        .prepare(
          `SELECT id, expires_at, accepted_at, revoked_at, created_at
           FROM invites
           WHERE household_id = ?1
           ORDER BY created_at DESC`,
        )
        .bind(input.householdId)
        .all<{
          id: string
          expires_at: string
          accepted_at: string | null
          revoked_at: string | null
          created_at: string
        }>()

      return result.results.map((row) => ({
        id: row.id,
        status: deriveInviteStatus(
          {
            acceptedAt: row.accepted_at,
            revokedAt: row.revoked_at,
            expiresAt: row.expires_at,
          },
          input.now,
        ),
        expiresAt: row.expires_at,
        createdAt: row.created_at,
      }))
    },

    async getInviteByTokenHash(tokenHash): Promise<HouseholdInviteRecord | null> {
      return readInviteByHash(tokenHash)
    },

    async acceptInvite(input): Promise<ActiveHousehold> {
      const invite = await readInviteByHash(input.tokenHash)
      if (!invite) {
        throw new DomainError('NOT_FOUND', 'Not found')
      }

      const status = deriveInviteStatus(invite, input.now)
      if (status === 'accepted' && invite.acceptedByUserId === input.userId) {
        const membership = await requireMember(input.userId, invite.householdId)
        await writeActiveHouseholdId(input.userId, invite.householdId, input.now)
        return {
          id: invite.householdId,
          name: invite.householdName,
          role: membership.role,
        }
      }

      assertInviteAcceptable(status)

      await db.batch([
        db
          .prepare(
            `UPDATE invites
             SET accepted_at = ?1, accepted_by_user_id = ?2
             WHERE id = ?3
               AND accepted_at IS NULL
               AND revoked_at IS NULL
               AND expires_at > ?1`,
          )
          .bind(input.now, input.userId, invite.id),
        db
          .prepare(
            `INSERT INTO household_members (household_id, user_id, role, created_at)
             SELECT ?1, ?2, 'member', ?3
             WHERE EXISTS (
               SELECT 1 FROM invites WHERE id = ?4 AND accepted_by_user_id = ?2
             )
             AND NOT EXISTS (
               SELECT 1 FROM household_members WHERE household_id = ?1 AND user_id = ?2
             )`,
          )
          .bind(invite.householdId, input.userId, input.now, invite.id),
        db
          .prepare(
            `UPDATE profiles
             SET active_household_id = ?1, updated_at = ?2
             WHERE id = ?3
               AND EXISTS (
                 SELECT 1 FROM household_members WHERE household_id = ?1 AND user_id = ?3
               )`,
          )
          .bind(invite.householdId, input.now, input.userId),
      ])

      const after = await readInviteByHash(input.tokenHash)
      if (after?.acceptedByUserId === input.userId) {
        const membership = await requireMember(input.userId, invite.householdId)
        return {
          id: invite.householdId,
          name: invite.householdName,
          role: membership.role,
        }
      }

      if (after) {
        assertInviteAcceptable(deriveInviteStatus(after, input.now))
      }

      throw new DomainError('NOT_FOUND', 'Not found')
    },

    async revokeInvite(input): Promise<void> {
      await requireOwner(input.actorUserId, input.householdId)
      const row = await db
        .prepare(
          `SELECT id, accepted_at, revoked_at, expires_at
           FROM invites
           WHERE id = ?1 AND household_id = ?2`,
        )
        .bind(input.inviteId, input.householdId)
        .first<{
          id: string
          accepted_at: string | null
          revoked_at: string | null
          expires_at: string
        }>()

      if (!row) {
        throw new DomainError('NOT_FOUND', 'Not found')
      }

      if (row.accepted_at) {
        throw new DomainError('INVITE_ALREADY_ACCEPTED', 'Invite already accepted')
      }

      if (row.revoked_at) {
        return
      }

      await db
        .prepare(`UPDATE invites SET revoked_at = ?1 WHERE id = ?2 AND accepted_at IS NULL`)
        .bind(input.now, input.inviteId)
        .run()
    },

    async listMembers(input): Promise<HouseholdMemberRecord[]> {
      await requireMember(input.actorUserId, input.householdId)
      const result = await db
        .prepare(
          `SELECT m.user_id AS user_id, u.name AS name, u.email AS email, m.role AS role
           FROM household_members m
           INNER JOIN "user" u ON u.id = m.user_id
           WHERE m.household_id = ?1
           ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END, u.name COLLATE NOCASE ASC`,
        )
        .bind(input.householdId)
        .all<MemberRow>()

      return result.results.map((row) => ({
        userId: row.user_id,
        name: row.name,
        email: row.email,
        role: row.role,
      }))
    },

    async removeMember(input): Promise<void> {
      await requireOwner(input.actorUserId, input.householdId)

      if (input.memberUserId === input.actorUserId) {
        throw new DomainError('OWNER_CANNOT_REMOVE_SELF', 'Owner cannot remove themselves')
      }

      const target = await membershipFor(input.memberUserId, input.householdId)
      if (!target) {
        throw new DomainError('NOT_FOUND', 'Not found')
      }

      if (target.role === 'owner') {
        throw new DomainError('FORBIDDEN', 'Forbidden')
      }

      await db.batch([
        db
          .prepare(`DELETE FROM household_members WHERE household_id = ?1 AND user_id = ?2`)
          .bind(input.householdId, input.memberUserId),
        db
          .prepare(
            `UPDATE profiles
             SET active_household_id = (
               SELECT m.household_id
               FROM household_members m
               INNER JOIN households h ON h.id = m.household_id
               WHERE m.user_id = ?1
               ORDER BY h.created_at ASC, h.name ASC
               LIMIT 1
             ),
             updated_at = ?2
             WHERE id = ?1 AND active_household_id = ?3`,
          )
          .bind(input.memberUserId, input.now, input.householdId),
      ])
    },

    async leaveHousehold(input): Promise<void> {
      const membership = await requireMember(input.userId, input.householdId)
      if (membership.role === 'owner') {
        throw new DomainError('OWNER_CANNOT_LEAVE', 'Owner cannot leave')
      }

      await db.batch([
        db
          .prepare(`DELETE FROM household_members WHERE household_id = ?1 AND user_id = ?2`)
          .bind(input.householdId, input.userId),
        db
          .prepare(
            `UPDATE profiles
             SET active_household_id = (
               SELECT m.household_id
               FROM household_members m
               INNER JOIN households h ON h.id = m.household_id
               WHERE m.user_id = ?1
               ORDER BY h.created_at ASC, h.name ASC
               LIMIT 1
             ),
             updated_at = ?2
             WHERE id = ?1 AND active_household_id = ?3`,
          )
          .bind(input.userId, input.now, input.householdId),
      ])
    },
  }
}
