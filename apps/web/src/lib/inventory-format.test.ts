import { expect, test } from 'vitest'
import {
  formatExpiryHeadline,
  formatLotExpiry,
  formatQuantity,
  isExpirySoon,
  unitLabel,
} from './inventory-format'

test('formats Romanian quantities and unit labels', () => {
  expect(formatQuantity(2000, 'ml')).toBe('2.000 ml')
  expect(formatQuantity(10, 'each')).toBe('10 buc')
  expect(formatQuantity(1, 'package')).toBe('1 pachet')
  expect(formatQuantity(2, 'package')).toBe('2 pachete')
  expect(unitLabel('g')).toBe('g')
})

test('formats expiry copy without shifting the calendar date', () => {
  expect(formatExpiryHeadline('2026-09-12')).toBe('Expiră pe 12 sept.')
  expect(formatLotExpiry(null)).toBe('fără expirare')
})

test('treats expiry within three days as soon', () => {
  expect(isExpirySoon('2026-09-06', '2026-09-06')).toBe(true)
  expect(isExpirySoon('2026-09-09', '2026-09-06')).toBe(true)
  expect(isExpirySoon('2026-09-10', '2026-09-06')).toBe(false)
})
