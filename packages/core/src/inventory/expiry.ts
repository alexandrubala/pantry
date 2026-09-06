import { DomainError } from '../errors.js'

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export function expiresKey(expiresOn: string | null): string {
  return expiresOn ?? ''
}

export function parseExpiresOn(value: unknown): string | null {
  if (value == null) {
    return null
  }

  if (typeof value !== 'string') {
    throw new DomainError('INVALID_EXPIRY', 'Invalid expiry date')
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const match = ISO_DATE.exec(trimmed)
  if (!match) {
    throw new DomainError('INVALID_EXPIRY', 'Invalid expiry date')
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const utc = new Date(Date.UTC(year, month - 1, day))

  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    throw new DomainError('INVALID_EXPIRY', 'Invalid expiry date')
  }

  return trimmed
}
