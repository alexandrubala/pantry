import { expect, test } from 'vitest'
import { DomainError } from '../errors.js'
import { parseExpiresOn } from './expiry.js'
import { validateQuantity } from './quantity.js'

test('accepts ISO date-only expiry values', () => {
  expect(parseExpiresOn(null)).toBeNull()
  expect(parseExpiresOn('')).toBeNull()
  expect(parseExpiresOn('  2026-09-15  ')).toBe('2026-09-15')
})

test('rejects non-ISO and impossible expiry dates', () => {
  expect(() => parseExpiresOn('2026-09-15T00:00:00Z')).toThrow(DomainError)
  expect(() => parseExpiresOn('15/09/2026')).toThrow(DomainError)
  expect(() => parseExpiresOn('2026-02-30')).toThrow(DomainError)
  expect(() => parseExpiresOn(12)).toThrow(DomainError)
})

test('rejects non-positive quantities', () => {
  expect(validateQuantity(1)).toBe(1)
  expect(() => validateQuantity(0)).toThrow(DomainError)
  expect(() => validateQuantity(-1)).toThrow(DomainError)
  expect(() => validateQuantity(Number.NaN)).toThrow(DomainError)
})
