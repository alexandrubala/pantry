import { DomainError } from '../errors.js'

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const MS_PER_DAY = 86_400_000

/** MVP attention window. DATE-ONLY; never timezone-shift calendar dates. */
export const EXPIRING_SOON_DAYS = 7

export type ExpiryStatus = 'expired' | 'today' | 'tomorrow' | 'soon' | 'later' | 'none'

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

  return parseRequiredIsoDate(trimmed)
}

export function parseRequiredIsoDate(value: unknown): string {
  if (typeof value !== 'string') {
    throw new DomainError('INVALID_EXPIRY', 'Invalid expiry date')
  }

  const trimmed = value.trim()
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

export function utcIsoDate(date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

export function addDaysIso(isoDate: string, days: number): string {
  const parsed = parseRequiredIsoDate(isoDate)
  const year = Number(parsed.slice(0, 4))
  const month = Number(parsed.slice(5, 7))
  const day = Number(parsed.slice(8, 10))
  const utc = new Date(Date.UTC(year, month - 1, day + days))
  const y = String(utc.getUTCFullYear()).padStart(4, '0')
  const m = String(utc.getUTCMonth() + 1).padStart(2, '0')
  const d = String(utc.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function calendarDaysBetween(from: string, to: string): number {
  const start = parseRequiredIsoDate(from)
  const end = parseRequiredIsoDate(to)
  const startUtc = Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1, Number(start.slice(8, 10)))
  const endUtc = Date.UTC(Number(end.slice(0, 4)), Number(end.slice(5, 7)) - 1, Number(end.slice(8, 10)))
  return Math.round((endUtc - startUtc) / MS_PER_DAY)
}

export function classifyExpiry(expiresOn: string | null, today: string): ExpiryStatus {
  if (!expiresOn) {
    return 'none'
  }

  parseRequiredIsoDate(expiresOn)
  const todayDate = parseRequiredIsoDate(today)

  if (expiresOn < todayDate) {
    return 'expired'
  }
  if (expiresOn === todayDate) {
    return 'today'
  }
  if (expiresOn === addDaysIso(todayDate, 1)) {
    return 'tomorrow'
  }
  if (expiresOn <= addDaysIso(todayDate, EXPIRING_SOON_DAYS)) {
    return 'soon'
  }

  return 'later'
}

export function isExpiredLot(expiresOn: string | null, today: string): boolean {
  return classifyExpiry(expiresOn, today) === 'expired'
}

export function isExpiringSoonLot(expiresOn: string | null, today: string, days = EXPIRING_SOON_DAYS): boolean {
  if (!expiresOn) {
    return false
  }

  const todayDate = parseRequiredIsoDate(today)
  parseRequiredIsoDate(expiresOn)
  return expiresOn >= todayDate && expiresOn <= addDaysIso(todayDate, days)
}
