import { expect, test } from 'vitest'
import { DomainError } from '../errors.js'
import {
  deriveInviteStatus,
  generateInviteToken,
  hashInviteToken,
  INVITE_TTL_MS,
  inviteExpiresAt,
  isInviteTokenFormat,
  requireInviteToken,
  assertInviteAcceptable,
} from './invite.js'

test('generateInviteToken returns 32-byte URL-safe base64 without padding', () => {
  const token = generateInviteToken()
  expect(isInviteTokenFormat(token)).toBe(true)
  expect(token).toHaveLength(43)
  expect(token).not.toMatch(/[+/=]/)
})

test('hashInviteToken stores SHA-256 hex and never equals the raw token', async () => {
  const token = generateInviteToken()
  const hash = await hashInviteToken(token)
  expect(hash).toMatch(/^[a-f0-9]{64}$/)
  expect(hash).not.toBe(token)
  expect(hash).not.toContain(token)
  await expect(hashInviteToken(token)).resolves.toBe(hash)
})

test('requireInviteToken rejects unknown formats as not found without echoing the value', () => {
  expect(() => requireInviteToken('example-invalid-token')).toThrow(DomainError)
  expect(() => requireInviteToken('example-invalid-token')).toThrowError(/Not found/)
  const token = `-_${'A'.repeat(41)}`
  expect(token).toHaveLength(43)
  expect(() => requireInviteToken(token)).not.toThrow()
})

test('inviteExpiresAt is seven days after the server timestamp', () => {
  const now = '2026-09-06T19:22:00.000Z'
  expect(Date.parse(inviteExpiresAt(now)) - Date.parse(now)).toBe(INVITE_TTL_MS)
})

test('deriveInviteStatus prefers revoked, then accepted, then expiry', () => {
  const now = '2026-09-06T19:22:00.000Z'
  expect(
    deriveInviteStatus(
      { acceptedAt: null, revokedAt: null, expiresAt: '2026-09-13T19:22:00.000Z' },
      now,
    ),
  ).toBe('pending')
  expect(
    deriveInviteStatus(
      { acceptedAt: now, revokedAt: null, expiresAt: '2026-09-13T19:22:00.000Z' },
      now,
    ),
  ).toBe('accepted')
  expect(
    deriveInviteStatus(
      { acceptedAt: null, revokedAt: now, expiresAt: '2026-09-13T19:22:00.000Z' },
      now,
    ),
  ).toBe('revoked')
  expect(
    deriveInviteStatus(
      { acceptedAt: null, revokedAt: null, expiresAt: '2026-09-06T19:22:00.000Z' },
      now,
    ),
  ).toBe('expired')
})

test('assertInviteAcceptable maps terminal statuses to domain errors', () => {
  expect(() => assertInviteAcceptable('pending')).not.toThrow()
  expect(() => assertInviteAcceptable('expired')).toThrowError(/Invite expired/)
  expect(() => assertInviteAcceptable('revoked')).toThrowError(/Invite revoked/)
  expect(() => assertInviteAcceptable('accepted')).toThrowError(/Invite already accepted/)
})
