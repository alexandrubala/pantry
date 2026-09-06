import { DomainError } from '../errors.js'

export const INVITE_TOKEN_BYTES = 32
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const INVITE_ROLE = 'member' as const

const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'revoked'

export type InviteTimestamps = {
  acceptedAt: string | null
  revokedAt: string | null
  expiresAt: string
}

export function generateInviteToken(): string {
  const bytes = new Uint8Array(INVITE_TOKEN_BYTES)
  crypto.getRandomValues(bytes)
  return bytesToBase64Url(bytes)
}

export function isInviteTokenFormat(token: string): boolean {
  return INVITE_TOKEN_PATTERN.test(token)
}

export function requireInviteToken(token: string | undefined): string {
  if (!token || !isInviteTokenFormat(token)) {
    throw new DomainError('NOT_FOUND', 'Not found')
  }

  return token
}

export async function hashInviteToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return bytesToHex(new Uint8Array(digest))
}

export function inviteExpiresAt(nowIso: string): string {
  return new Date(Date.parse(nowIso) + INVITE_TTL_MS).toISOString()
}

export function deriveInviteStatus(invite: InviteTimestamps, nowIso: string): InviteStatus {
  if (invite.revokedAt) {
    return 'revoked'
  }

  if (invite.acceptedAt) {
    return 'accepted'
  }

  if (Date.parse(invite.expiresAt) <= Date.parse(nowIso)) {
    return 'expired'
  }

  return 'pending'
}

export function assertInviteAcceptable(status: InviteStatus): void {
  switch (status) {
    case 'pending':
      return
    case 'expired':
      throw new DomainError('INVITE_EXPIRED', 'Invite expired')
    case 'revoked':
      throw new DomainError('INVITE_REVOKED', 'Invite revoked')
    case 'accepted':
      throw new DomainError('INVITE_ALREADY_ACCEPTED', 'Invite already accepted')
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}
