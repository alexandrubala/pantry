import type { ActiveHousehold, HouseholdRole } from './household-store.js'
import type { InviteStatus } from '../household/invite.js'

export type HouseholdInviteSummary = {
  id: string
  status: InviteStatus
  expiresAt: string
  createdAt: string
}

export type CreatedHouseholdInvite = {
  id: string
  expiresAt: string
}

export type HouseholdInviteRecord = {
  id: string
  householdId: string
  householdName: string
  tokenHash: string
  role: 'member'
  expiresAt: string
  acceptedAt: string | null
  revokedAt: string | null
  acceptedByUserId: string | null
  createdByUserId: string
  createdAt: string
}

export type HouseholdMemberRecord = {
  userId: string
  name: string
  email: string
  role: HouseholdRole
}

export type HouseholdSharingStore = {
  createInvite(input: {
    householdId: string
    actorUserId: string
    tokenHash: string
    now: string
    expiresAt: string
  }): Promise<CreatedHouseholdInvite>
  listInvites(input: {
    householdId: string
    actorUserId: string
    now: string
  }): Promise<HouseholdInviteSummary[]>
  getInviteByTokenHash(tokenHash: string): Promise<HouseholdInviteRecord | null>
  acceptInvite(input: {
    tokenHash: string
    userId: string
    now: string
  }): Promise<ActiveHousehold>
  revokeInvite(input: {
    householdId: string
    actorUserId: string
    inviteId: string
    now: string
  }): Promise<void>
  listMembers(input: {
    householdId: string
    actorUserId: string
  }): Promise<HouseholdMemberRecord[]>
  removeMember(input: {
    householdId: string
    actorUserId: string
    memberUserId: string
    now: string
  }): Promise<void>
  leaveHousehold(input: { householdId: string; userId: string; now: string }): Promise<void>
}
