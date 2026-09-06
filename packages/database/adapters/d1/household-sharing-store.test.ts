import { DatabaseSync } from 'node:sqlite'
import { expect, test } from 'vitest'
import { DomainError, hashInviteToken } from '@pantry/core'
import { createD1HouseholdStore } from './household-store.js'
import { createD1HouseholdSharingStore } from './household-sharing-store.js'
import { applyPantryMigrations, insertProfile, insertUser, sqliteAsD1 } from './sqlite-as-d1.js'

function openStores() {
  const sqlite = new DatabaseSync(':memory:')
  applyPantryMigrations(sqlite)
  const db = sqliteAsD1(sqlite)
  return {
    sqlite,
    households: createD1HouseholdStore(db),
    sharing: createD1HouseholdSharingStore(db),
  }
}

function seedUser(sqlite: DatabaseSync, id: string, name: string, email: string) {
  insertUser(sqlite, id, name, email)
  insertProfile(sqlite, id, name)
}

async function hashOf(token: string) {
  return hashInviteToken(token)
}

test('createInvite stores SHA-256 only and rejects members', async () => {
  const { sqlite, households, sharing } = openStores()
  seedUser(sqlite, 'user-a', 'Alex', 'alex@example.invalid')
  seedUser(sqlite, 'user-b', 'Maria', 'maria@example.invalid')
  const created = await households.createHouseholdWithOwnerAndLocations({
    userId: 'user-a',
    name: 'Casa mea',
    ownerDisplayName: 'Alex',
  })
  sqlite
    .prepare(
      `INSERT INTO household_members (household_id, user_id, role, created_at)
       VALUES (?, 'user-b', 'member', datetime('now'))`,
    )
    .run(created.household.id)

  const token = 'raw-invite-token-never-stored'
  const now = '2026-09-06T19:22:00.000Z'
  const invite = await sharing.createInvite({
    householdId: created.household.id,
    actorUserId: 'user-a',
    tokenHash: await hashOf(token),
    now,
    expiresAt: '2026-09-13T19:22:00.000Z',
  })

  const row = sqlite.prepare('SELECT * FROM invites WHERE id = ?').get(invite.id) as Record<
    string,
    unknown
  >
  expect(row.token_hash).toBe(await hashOf(token))
  expect(JSON.stringify(row)).not.toContain(token)
  expect(Object.keys(row)).not.toContain('token')

  await expect(
    sharing.createInvite({
      householdId: created.household.id,
      actorUserId: 'user-b',
      tokenHash: await hashOf('other-token-that-is-forty-three-chars-xx'),
      now,
      expiresAt: '2026-09-13T19:22:00.000Z',
    }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' })
})

test('acceptInvite is idempotent for the same user and rejects a second membership', async () => {
  const { sqlite, households, sharing } = openStores()
  seedUser(sqlite, 'user-a', 'Alex', 'alex@example.invalid')
  seedUser(sqlite, 'user-b', 'Maria', 'maria@example.invalid')
  const created = await households.createHouseholdWithOwnerAndLocations({
    userId: 'user-a',
    name: 'Casa comună',
    ownerDisplayName: 'Alex',
  })
  const token = 'accept-token-forty-three-characters-____x'
  const now = '2026-09-06T19:22:00.000Z'
  await sharing.createInvite({
    householdId: created.household.id,
    actorUserId: 'user-a',
    tokenHash: await hashOf(token),
    now,
    expiresAt: '2026-09-13T19:22:00.000Z',
  })

  const first = await sharing.acceptInvite({
    tokenHash: await hashOf(token),
    userId: 'user-b',
    now,
  })
  expect(first).toEqual({ id: created.household.id, name: 'Casa comună', role: 'member' })
  expect(
    sqlite.prepare('SELECT active_household_id FROM profiles WHERE id = ?').get('user-b'),
  ).toEqual({ active_household_id: created.household.id })

  const again = await sharing.acceptInvite({
    tokenHash: await hashOf(token),
    userId: 'user-b',
    now: '2026-09-06T19:23:00.000Z',
  })
  expect(again.id).toBe(created.household.id)
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM household_members').get()).toEqual({ n: 2 })

  seedUser(sqlite, 'user-c', 'Ion', 'ion@example.invalid')
  await expect(
    sharing.acceptInvite({
      tokenHash: await hashOf(token),
      userId: 'user-c',
      now,
    }),
  ).rejects.toMatchObject({ code: 'INVITE_ALREADY_ACCEPTED' })
  expect(
    sqlite.prepare('SELECT COUNT(*) AS n FROM household_members WHERE user_id = ?').get('user-c'),
  ).toEqual({ n: 0 })
})

test('concurrent accept of the same invite yields one membership', async () => {
  const { sqlite, households, sharing } = openStores()
  seedUser(sqlite, 'user-a', 'Alex', 'alex@example.invalid')
  seedUser(sqlite, 'user-b', 'Maria', 'maria@example.invalid')
  seedUser(sqlite, 'user-c', 'Ion', 'ion@example.invalid')
  const created = await households.createHouseholdWithOwnerAndLocations({
    userId: 'user-a',
    name: 'Casa comună',
    ownerDisplayName: 'Alex',
  })
  const token = 'race-token-forty-three-characters-______x'
  const now = '2026-09-06T19:22:00.000Z'
  await sharing.createInvite({
    householdId: created.household.id,
    actorUserId: 'user-a',
    tokenHash: await hashOf(token),
    now,
    expiresAt: '2026-09-13T19:22:00.000Z',
  })

  const results = await Promise.allSettled([
    sharing.acceptInvite({ tokenHash: await hashOf(token), userId: 'user-b', now }),
    sharing.acceptInvite({ tokenHash: await hashOf(token), userId: 'user-c', now }),
  ])

  const accepted = results.filter((result) => result.status === 'fulfilled')
  const rejected = results.filter((result) => result.status === 'rejected')
  expect(accepted).toHaveLength(1)
  expect(rejected).toHaveLength(1)
  expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
    code: 'INVITE_ALREADY_ACCEPTED',
  })
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM household_members').get()).toEqual({ n: 2 })
  expect(
    sqlite.prepare('SELECT COUNT(*) AS n FROM invites WHERE accepted_at IS NOT NULL').get(),
  ).toEqual({ n: 1 })
})

test('expired and revoked invites cannot be accepted', async () => {
  const { sqlite, households, sharing } = openStores()
  seedUser(sqlite, 'user-a', 'Alex', 'alex@example.invalid')
  seedUser(sqlite, 'user-b', 'Maria', 'maria@example.invalid')
  const created = await households.createHouseholdWithOwnerAndLocations({
    userId: 'user-a',
    name: 'Casa mea',
    ownerDisplayName: 'Alex',
  })
  const expiredToken = 'expired-token-forty-three-characters-___x'
  const revokedToken = 'revoked-token-forty-three-characters-___x'
  await sharing.createInvite({
    householdId: created.household.id,
    actorUserId: 'user-a',
    tokenHash: await hashOf(expiredToken),
    now: '2026-08-01T00:00:00.000Z',
    expiresAt: '2026-08-08T00:00:00.000Z',
  })
  const revoked = await sharing.createInvite({
    householdId: created.household.id,
    actorUserId: 'user-a',
    tokenHash: await hashOf(revokedToken),
    now: '2026-09-06T19:22:00.000Z',
    expiresAt: '2026-09-13T19:22:00.000Z',
  })
  await sharing.revokeInvite({
    householdId: created.household.id,
    actorUserId: 'user-a',
    inviteId: revoked.id,
    now: '2026-09-06T19:23:00.000Z',
  })

  await expect(
    sharing.acceptInvite({
      tokenHash: await hashOf(expiredToken),
      userId: 'user-b',
      now: '2026-09-06T19:22:00.000Z',
    }),
  ).rejects.toMatchObject({ code: 'INVITE_EXPIRED' })
  await expect(
    sharing.acceptInvite({
      tokenHash: await hashOf(revokedToken),
      userId: 'user-b',
      now: '2026-09-06T19:22:00.000Z',
    }),
  ).rejects.toMatchObject({ code: 'INVITE_REVOKED' })
})

test('removeMember keeps household data and repairs the removed user active household', async () => {
  const { sqlite, households, sharing } = openStores()
  seedUser(sqlite, 'user-a', 'Alex', 'alex@example.invalid')
  seedUser(sqlite, 'user-b', 'Maria', 'maria@example.invalid')
  const houseA = await households.createHouseholdWithOwnerAndLocations({
    userId: 'user-a',
    name: 'Casa comună',
    ownerDisplayName: 'Alex',
  })
  const houseB = await households.createHouseholdWithOwnerAndLocations({
    userId: 'user-b',
    name: 'Casa Mariei',
    ownerDisplayName: 'Maria',
  })
  sqlite
    .prepare(
      `INSERT INTO household_members (household_id, user_id, role, created_at)
       VALUES (?, 'user-b', 'member', datetime('now'))`,
    )
    .run(houseA.household.id)
  sqlite
    .prepare(`UPDATE profiles SET active_household_id = ? WHERE id = 'user-b'`)
    .run(houseA.household.id)

  await sharing.removeMember({
    householdId: houseA.household.id,
    actorUserId: 'user-a',
    memberUserId: 'user-b',
    now: '2026-09-06T19:22:00.000Z',
  })

  expect(
    sqlite
      .prepare('SELECT COUNT(*) AS n FROM household_members WHERE household_id = ? AND user_id = ?')
      .get(houseA.household.id, 'user-b'),
  ).toEqual({ n: 0 })
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM households').get()).toEqual({ n: 2 })
  expect(
    sqlite.prepare('SELECT active_household_id FROM profiles WHERE id = ?').get('user-b'),
  ).toEqual({ active_household_id: houseB.household.id })
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM "user" WHERE id = ?').get('user-b')).toEqual({
    n: 1,
  })
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM profiles WHERE id = ?').get('user-b')).toEqual({
    n: 1,
  })
})

test('leaveHousehold is forbidden for owners and members can leave without deleting data', async () => {
  const { sqlite, households, sharing } = openStores()
  seedUser(sqlite, 'user-a', 'Alex', 'alex@example.invalid')
  seedUser(sqlite, 'user-b', 'Maria', 'maria@example.invalid')
  const created = await households.createHouseholdWithOwnerAndLocations({
    userId: 'user-a',
    name: 'Casa mea',
    ownerDisplayName: 'Alex',
  })
  sqlite
    .prepare(
      `INSERT INTO household_members (household_id, user_id, role, created_at)
       VALUES (?, 'user-b', 'member', datetime('now'))`,
    )
    .run(created.household.id)
  sqlite
    .prepare(`UPDATE profiles SET active_household_id = ? WHERE id = 'user-b'`)
    .run(created.household.id)

  await expect(
    sharing.leaveHousehold({
      householdId: created.household.id,
      userId: 'user-a',
      now: '2026-09-06T19:22:00.000Z',
    }),
  ).rejects.toMatchObject({ code: 'OWNER_CANNOT_LEAVE' })

  await sharing.leaveHousehold({
    householdId: created.household.id,
    userId: 'user-b',
    now: '2026-09-06T19:22:00.000Z',
  })

  expect(
    sqlite.prepare('SELECT COUNT(*) AS n FROM household_members WHERE user_id = ?').get('user-b'),
  ).toEqual({ n: 0 })
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM households').get()).toEqual({ n: 1 })
  expect(
    sqlite.prepare('SELECT active_household_id FROM profiles WHERE id = ?').get('user-b'),
  ).toEqual({ active_household_id: null })
  expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})

test('owner cannot remove themselves', async () => {
  const { sqlite, households, sharing } = openStores()
  seedUser(sqlite, 'user-a', 'Alex', 'alex@example.invalid')
  const created = await households.createHouseholdWithOwnerAndLocations({
    userId: 'user-a',
    name: 'Casa mea',
    ownerDisplayName: 'Alex',
  })

  await expect(
    sharing.removeMember({
      householdId: created.household.id,
      actorUserId: 'user-a',
      memberUserId: 'user-a',
      now: '2026-09-06T19:22:00.000Z',
    }),
  ).rejects.toBeInstanceOf(DomainError)
  await expect(
    sharing.removeMember({
      householdId: created.household.id,
      actorUserId: 'user-a',
      memberUserId: 'user-a',
      now: '2026-09-06T19:22:00.000Z',
    }),
  ).rejects.toMatchObject({ code: 'OWNER_CANNOT_REMOVE_SELF' })
})
