import { beforeEach, expect, test, vi } from 'vitest'
import { hashInviteToken, isInviteTokenFormat } from '@pantry/core'

vi.mock('../auth/session.js', () => ({
  resolveCurrentUser: vi.fn(),
}))

import { resolveCurrentUser } from '../auth/session.js'
import { app } from '../index'
import { envWithDb, insertProfile, insertUser, openPantryDb } from '../test/sqlite-d1'

const resolveCurrentUserMock = vi.mocked(resolveCurrentUser)

beforeEach(() => {
  resolveCurrentUserMock.mockReset()
  resolveCurrentUserMock.mockResolvedValue(null)
})

async function createHousehold(db: ReturnType<typeof openPantryDb>, userId: string, name: string) {
  resolveCurrentUserMock.mockResolvedValue({ id: userId, name: userId })
  const res = await app.request(
    '/api/v1/households',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    },
    envWithDb(db),
  )
  expect(res.status).toBe(201)
  return (await res.json()) as { household: { id: string; name: string; role: string } }
}

async function fridgeId(db: ReturnType<typeof openPantryDb>) {
  const res = await app.request('/api/v1/locations', {}, envWithDb(db))
  const body = (await res.json()) as { locations: Array<{ id: string; name: string }> }
  const fridge = body.locations.find((location) => location.name === 'Frigider')
  if (!fridge) {
    throw new Error('missing Frigider')
  }
  return fridge.id
}

async function createProduct(db: ReturnType<typeof openPantryDb>, name: string, unit: string) {
  const res = await app.request(
    '/api/v1/products',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, unit }),
    },
    envWithDb(db),
  )
  expect(res.status).toBe(201)
  return (await res.json()) as { product: { id: string; name: string } }
}

async function createInvite(db: ReturnType<typeof openPantryDb>) {
  const res = await app.request('/api/v1/household/invites', { method: 'POST' }, envWithDb(db))
  expect(res.status).toBe(201)
  return (await res.json()) as { invite: { id: string; token: string; expiresAt: string } }
}

test('household sharing routes require a session except invite preview', async () => {
  const env = envWithDb(openPantryDb())
  expect((await app.request('/api/v1/household/invites', { method: 'POST' }, env)).status).toBe(401)
  expect((await app.request('/api/v1/household/invites', {}, env)).status).toBe(401)
  expect((await app.request('/api/v1/household/members', {}, env)).status).toBe(401)
  expect((await app.request('/api/v1/household/leave', { method: 'POST' }, env)).status).toBe(401)
  expect((await app.request('/api/v1/invites/example-invalid-token/accept', { method: 'POST' }, env)).status).toBe(
    401,
  )
})

test('invalid invite tokens are 404 and do not leak household data', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-a', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-a', 'Alex')
  await createHousehold(db, 'user-a', 'Casa secretă')

  const preview = await app.request('/api/v1/invites/example-invalid-token', {}, envWithDb(db))
  expect(preview.status).toBe(404)
  const body = await preview.json()
  expect(body).toEqual({ error: 'Not found', code: 'NOT_FOUND' })
  expect(JSON.stringify(body)).not.toMatch(/Casa secretă|token_hash|alex@example/)
})

test('owner creates a hashed invite, lists metadata, and can revoke it', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-a', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-a', 'Alex')
  await createHousehold(db, 'user-a', 'Casa mea')

  const created = await createInvite(db)
  expect(isInviteTokenFormat(created.invite.token)).toBe(true)
  expect(created.invite.expiresAt).toEqual(expect.any(String))

  const stored = db.prepare('SELECT * FROM invites WHERE id = ?').get(created.invite.id) as Record<
    string,
    unknown
  >
  expect(stored.token_hash).toBe(await hashInviteToken(created.invite.token))
  expect(JSON.stringify(stored)).not.toContain(created.invite.token)
  expect(Object.keys(stored)).not.toContain('token')

  const listed = await app.request('/api/v1/household/invites', {}, envWithDb(db))
  expect(listed.status).toBe(200)
  const listedBody = await listed.json()
  expect(listedBody.invites).toEqual([
    expect.objectContaining({
      id: created.invite.id,
      status: 'pending',
      expiresAt: created.invite.expiresAt,
    }),
  ])
  expect(JSON.stringify(listedBody)).not.toContain(created.invite.token)
  expect(JSON.stringify(listedBody)).not.toMatch(/token_hash/)

  const preview = await app.request(`/api/v1/invites/${created.invite.token}`, {}, envWithDb(db))
  expect(preview.status).toBe(200)
  await expect(preview.json()).resolves.toEqual({
    valid: true,
    householdName: 'Casa mea',
    expiresAt: created.invite.expiresAt,
  })

  const revoked = await app.request(
    `/api/v1/household/invites/${created.invite.id}`,
    { method: 'DELETE' },
    envWithDb(db),
  )
  expect(revoked.status).toBe(204)

  const afterRevoke = await app.request(`/api/v1/invites/${created.invite.token}`, {}, envWithDb(db))
  expect(afterRevoke.status).toBe(410)
  const revokedBody = await afterRevoke.json()
  expect(revokedBody.code).toBe('INVITE_REVOKED')
  expect(JSON.stringify(revokedBody)).not.toMatch(/Casa mea/)
})

test('shared household data is the same inventory and shopping list after accept', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-a', 'Alex', 'alex@example.invalid')
  insertUser(db, 'user-b', 'Maria', 'maria@example.invalid')
  insertProfile(db, 'user-a', 'Alex')
  insertProfile(db, 'user-b', 'Maria')

  const household = await createHousehold(db, 'user-a', 'Casa comună')
  const locationId = await fridgeId(db)
  const product = await createProduct(db, 'Lapte', 'ml')
  await app.request(
    '/api/v1/inventory/stock',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        productId: product.product.id,
        locationId,
        quantity: 1000,
        expiresOn: null,
      }),
    },
    envWithDb(db),
  )
  await app.request(
    '/api/v1/shopping/items',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ouă' }),
    },
    envWithDb(db),
  )

  const invite = await createInvite(db)

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-b', name: 'Maria' })
  const accepted = await app.request(
    `/api/v1/invites/${invite.invite.token}/accept`,
    { method: 'POST' },
    envWithDb(db),
  )
  expect(accepted.status).toBe(200)
  const acceptedBody = await accepted.json()
  expect(acceptedBody.household).toEqual({
    id: household.household.id,
    name: 'Casa comună',
    role: 'member',
  })
  expect(db.prepare('SELECT active_household_id FROM profiles WHERE id = ?').get('user-b')).toEqual({
    active_household_id: household.household.id,
  })

  const inventoryB = await app.request('/api/v1/inventory', {}, envWithDb(db))
  const inventoryBBody = await inventoryB.json()
  expect(inventoryBBody.items).toHaveLength(1)
  expect(inventoryBBody.items[0].product.name).toBe('Lapte')
  expect(inventoryBBody.items[0].totalQuantity).toBe(1000)

  const shoppingB = await app.request('/api/v1/shopping', {}, envWithDb(db))
  const shoppingBBody = await shoppingB.json()
  expect(shoppingBBody.list.items.map((item: { name: string }) => item.name)).toEqual(['Ouă'])

  const locationsB = await app.request('/api/v1/locations', {}, envWithDb(db))
  const locationsAUser = { id: 'user-a', name: 'Alex' }
  resolveCurrentUserMock.mockResolvedValue(locationsAUser)
  const locationsA = await app.request('/api/v1/locations', {}, envWithDb(db))
  expect(await locationsB.json()).toEqual(await locationsA.json())

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-b', name: 'Maria' })
  await app.request(
    '/api/v1/inventory/stock',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        productId: product.product.id,
        locationId,
        quantity: 500,
        expiresOn: null,
      }),
    },
    envWithDb(db),
  )
  const shoppingItemId = shoppingBBody.list.items[0].id as string
  await app.request(
    `/api/v1/shopping/items/${shoppingItemId}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ checked: true }),
    },
    envWithDb(db),
  )

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-a', name: 'Alex' })
  const inventoryA = await app.request('/api/v1/inventory', {}, envWithDb(db))
  const inventoryABody = await inventoryA.json()
  expect(inventoryABody.items[0].totalQuantity).toBe(1500)
  const shoppingA = await app.request('/api/v1/shopping', {}, envWithDb(db))
  const shoppingABody = await shoppingA.json()
  expect(shoppingABody.list.items[0].checked).toBe(true)
  expect(db.prepare('SELECT COUNT(*) AS n FROM households').get()).toEqual({ n: 1 })
  expect(db.prepare('SELECT COUNT(*) AS n FROM products').get()).toEqual({ n: 1 })
})

test('one household can contain owner plus two members', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-a', 'Alex', 'alex@example.invalid')
  insertUser(db, 'user-b', 'Maria', 'maria@example.invalid')
  insertUser(db, 'user-c', 'Ion', 'ion@example.invalid')
  insertProfile(db, 'user-a', 'Alex')
  insertProfile(db, 'user-b', 'Maria')
  insertProfile(db, 'user-c', 'Ion')
  await createHousehold(db, 'user-a', 'Casa mea')

  const inviteB = await createInvite(db)
  resolveCurrentUserMock.mockResolvedValue({ id: 'user-b', name: 'Maria' })
  expect(
    (await app.request(`/api/v1/invites/${inviteB.invite.token}/accept`, { method: 'POST' }, envWithDb(db)))
      .status,
  ).toBe(200)

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-a', name: 'Alex' })
  const inviteC = await createInvite(db)
  resolveCurrentUserMock.mockResolvedValue({ id: 'user-c', name: 'Ion' })
  expect(
    (await app.request(`/api/v1/invites/${inviteC.invite.token}/accept`, { method: 'POST' }, envWithDb(db)))
      .status,
  ).toBe(200)

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-b', name: 'Maria' })
  const members = await app.request('/api/v1/household/members', {}, envWithDb(db))
  expect(members.status).toBe(200)
  const body = await members.json()
  expect(body.members).toHaveLength(3)
  expect(body.members.map((member: { email: string; role: string }) => [member.email, member.role])).toEqual(
    expect.arrayContaining([
      ['alex@example.invalid', 'owner'],
      ['maria@example.invalid', 'member'],
      ['ion@example.invalid', 'member'],
    ]),
  )
  expect(body.members.find((member: { isCurrentUser: boolean }) => member.isCurrentUser).email).toBe(
    'maria@example.invalid',
  )
})

test('members cannot invite, list pending invites, revoke, or remove others', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-a', 'Alex', 'alex@example.invalid')
  insertUser(db, 'user-b', 'Maria', 'maria@example.invalid')
  insertUser(db, 'user-c', 'Ion', 'ion@example.invalid')
  insertProfile(db, 'user-a', 'Alex')
  insertProfile(db, 'user-b', 'Maria')
  insertProfile(db, 'user-c', 'Ion')
  await createHousehold(db, 'user-a', 'Casa mea')
  const inviteB = await createInvite(db)
  const inviteC = await createInvite(db)

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-b', name: 'Maria' })
  await app.request(`/api/v1/invites/${inviteB.invite.token}/accept`, { method: 'POST' }, envWithDb(db))
  resolveCurrentUserMock.mockResolvedValue({ id: 'user-c', name: 'Ion' })
  await app.request(`/api/v1/invites/${inviteC.invite.token}/accept`, { method: 'POST' }, envWithDb(db))

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-b', name: 'Maria' })
  const create = await app.request('/api/v1/household/invites', { method: 'POST' }, envWithDb(db))
  expect(create.status).toBe(403)
  expect(await create.json()).toEqual({ error: 'Forbidden', code: 'FORBIDDEN' })

  const list = await app.request('/api/v1/household/invites', {}, envWithDb(db))
  expect(list.status).toBe(403)

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-a', name: 'Alex' })
  const pending = await createInvite(db)
  resolveCurrentUserMock.mockResolvedValue({ id: 'user-b', name: 'Maria' })
  const revoke = await app.request(
    `/api/v1/household/invites/${pending.invite.id}`,
    { method: 'DELETE' },
    envWithDb(db),
  )
  expect(revoke.status).toBe(403)

  const removeC = await app.request('/api/v1/household/members/user-c', { method: 'DELETE' }, envWithDb(db))
  expect(removeC.status).toBe(403)
  const removeOwner = await app.request(
    '/api/v1/household/members/user-a',
    { method: 'DELETE' },
    envWithDb(db),
  )
  expect(removeOwner.status).toBe(403)
})

test('expired, revoked, and unknown tokens cannot be accepted', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-a', 'Alex', 'alex@example.invalid')
  insertUser(db, 'user-b', 'Maria', 'maria@example.invalid')
  insertProfile(db, 'user-a', 'Alex')
  insertProfile(db, 'user-b', 'Maria')
  await createHousehold(db, 'user-a', 'Casa mea')
  const invite = await createInvite(db)
  db.prepare(`UPDATE invites SET expires_at = ? WHERE id = ?`).run(
    '2026-01-01T00:00:00.000Z',
    invite.invite.id,
  )

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-b', name: 'Maria' })
  const expired = await app.request(
    `/api/v1/invites/${invite.invite.token}/accept`,
    { method: 'POST' },
    envWithDb(db),
  )
  expect(expired.status).toBe(410)
  expect((await expired.json()).code).toBe('INVITE_EXPIRED')

  const unknown = await app.request(
    `/api/v1/invites/${'A'.repeat(43)}/accept`,
    { method: 'POST' },
    envWithDb(db),
  )
  expect(unknown.status).toBe(404)
})

test('URL-safe invite tokens with leading dashes are accepted', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-a', 'Alex', 'alex@example.invalid')
  insertUser(db, 'user-b', 'Maria', 'maria@example.invalid')
  insertProfile(db, 'user-a', 'Alex')
  insertProfile(db, 'user-b', 'Maria')
  const household = await createHousehold(db, 'user-a', 'Casa mea')
  const token = `-${'_'.repeat(42)}`
  expect(isInviteTokenFormat(token)).toBe(true)
  db.prepare(
    `INSERT INTO invites (
       id, household_id, token_hash, role, expires_at, created_by_user_id, created_at
     ) VALUES ('inv-dash', ?, ?, 'member', datetime('now', '+7 days'), 'user-a', datetime('now'))`,
  ).run(household.household.id, await hashInviteToken(token))

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-b', name: 'Maria' })
  const accepted = await app.request(`/api/v1/invites/${token}/accept`, { method: 'POST' }, envWithDb(db))
  expect(accepted.status).toBe(200)
})

test('a user with another household can accept and switch active household', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-a', 'Alex', 'alex@example.invalid')
  insertUser(db, 'user-b', 'Maria', 'maria@example.invalid')
  insertProfile(db, 'user-a', 'Alex')
  insertProfile(db, 'user-b', 'Maria')
  const houseA = await createHousehold(db, 'user-a', 'Casa lui Alex')
  const houseB = await createHousehold(db, 'user-b', 'Casa Mariei')
  resolveCurrentUserMock.mockResolvedValue({ id: 'user-a', name: 'Alex' })
  const invite = await createInvite(db)

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-b', name: 'Maria' })
  const accepted = await app.request(
    `/api/v1/invites/${invite.invite.token}/accept`,
    { method: 'POST' },
    envWithDb(db),
  )
  expect(accepted.status).toBe(200)
  expect(db.prepare('SELECT active_household_id FROM profiles WHERE id = ?').get('user-b')).toEqual({
    active_household_id: houseA.household.id,
  })
  expect(
    db.prepare('SELECT COUNT(*) AS n FROM household_members WHERE user_id = ?').get('user-b'),
  ).toEqual({ n: 2 })

  const switched = await app.request(
    '/api/v1/household/active',
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ householdId: houseB.household.id }),
    },
    envWithDb(db),
  )
  expect(switched.status).toBe(200)
  const membersB = await app.request('/api/v1/household/members', {}, envWithDb(db))
  const membersBBody = await membersB.json()
  expect(membersBBody.members).toHaveLength(1)
  expect(membersBBody.members[0].email).toBe('maria@example.invalid')

  await app.request(
    '/api/v1/household/active',
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ householdId: houseA.household.id }),
    },
    envWithDb(db),
  )
  const membersA = await app.request('/api/v1/household/members', {}, envWithDb(db))
  expect((await membersA.json()).members).toHaveLength(2)
})

test('owner removal leaves household data and repairs the member active household', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-a', 'Alex', 'alex@example.invalid')
  insertUser(db, 'user-b', 'Maria', 'maria@example.invalid')
  insertProfile(db, 'user-a', 'Alex')
  insertProfile(db, 'user-b', 'Maria')
  await createHousehold(db, 'user-a', 'Casa comună')
  const locationId = await fridgeId(db)
  const product = await createProduct(db, 'Lapte', 'ml')
  await app.request(
    '/api/v1/inventory/stock',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: product.product.id, locationId, quantity: 1000, expiresOn: null }),
    },
    envWithDb(db),
  )
  await app.request(
    '/api/v1/shopping/items',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ouă' }),
    },
    envWithDb(db),
  )
  const invite = await createInvite(db)
  resolveCurrentUserMock.mockResolvedValue({ id: 'user-b', name: 'Maria' })
  await app.request(`/api/v1/invites/${invite.invite.token}/accept`, { method: 'POST' }, envWithDb(db))

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-a', name: 'Alex' })
  const removed = await app.request(
    '/api/v1/household/members/user-b',
    { method: 'DELETE' },
    envWithDb(db),
  )
  expect(removed.status).toBe(204)
  expect(
    db.prepare('SELECT COUNT(*) AS n FROM household_members WHERE user_id = ?').get('user-b'),
  ).toEqual({ n: 0 })
  expect(db.prepare('SELECT COUNT(*) AS n FROM inventory_lots').get()).not.toEqual({ n: 0 })
  expect(db.prepare('SELECT COUNT(*) AS n FROM shopping_items').get()).not.toEqual({ n: 0 })
  expect(db.prepare('SELECT COUNT(*) AS n FROM "user" WHERE id = ?').get('user-b')).toEqual({ n: 1 })
  expect(db.prepare('SELECT active_household_id FROM profiles WHERE id = ?').get('user-b')).toEqual({
    active_household_id: null,
  })

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-b', name: 'Maria' })
  const inventory = await app.request('/api/v1/inventory', {}, envWithDb(db))
  expect(inventory.status).toBe(409)
  expect((await inventory.json()).code).toBe('HOUSEHOLD_REQUIRED')
})

test('members can leave and owners receive OWNER_CANNOT_LEAVE', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-a', 'Alex', 'alex@example.invalid')
  insertUser(db, 'user-b', 'Maria', 'maria@example.invalid')
  insertProfile(db, 'user-a', 'Alex')
  insertProfile(db, 'user-b', 'Maria')
  await createHousehold(db, 'user-a', 'Casa mea')
  const invite = await createInvite(db)
  resolveCurrentUserMock.mockResolvedValue({ id: 'user-b', name: 'Maria' })
  await app.request(`/api/v1/invites/${invite.invite.token}/accept`, { method: 'POST' }, envWithDb(db))

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-a', name: 'Alex' })
  const ownerLeave = await app.request('/api/v1/household/leave', { method: 'POST' }, envWithDb(db))
  expect(ownerLeave.status).toBe(409)
  expect(await ownerLeave.json()).toEqual({
    error: 'Owner cannot leave',
    code: 'OWNER_CANNOT_LEAVE',
  })

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-b', name: 'Maria' })
  const left = await app.request('/api/v1/household/leave', { method: 'POST' }, envWithDb(db))
  expect(left.status).toBe(204)
  expect(
    db.prepare('SELECT COUNT(*) AS n FROM household_members WHERE user_id = ?').get('user-b'),
  ).toEqual({ n: 0 })
  expect(db.prepare('SELECT COUNT(*) AS n FROM households').get()).toEqual({ n: 1 })
})

test('new users without a household can accept an invite', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-a', 'Alex', 'alex@example.invalid')
  insertUser(db, 'user-b', 'Maria', 'maria@example.invalid')
  insertProfile(db, 'user-a', 'Alex')
  const household = await createHousehold(db, 'user-a', 'Casa mea')
  const invite = await createInvite(db)

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-b', name: 'Maria' })
  const accepted = await app.request(
    `/api/v1/invites/${invite.invite.token}/accept`,
    { method: 'POST' },
    envWithDb(db),
  )
  expect(accepted.status).toBe(200)
  expect((await accepted.json()).household.id).toBe(household.household.id)
  expect(db.prepare('SELECT active_household_id FROM profiles WHERE id = ?').get('user-b')).toEqual({
    active_household_id: household.household.id,
  })
})
