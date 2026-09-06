import { expect, test } from 'vitest'
import {
  formatExpiryHeadline,
  formatLotExpiry,
  formatQuantity,
  formatKcal100g,
  formatMacroLine,
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

test('formats source nutrition without inventing values', () => {
  expect(formatKcal100g(539)).toBe('539 kcal / 100 g')
  expect(
    formatMacroLine({
      energyKcal100g: 539,
      proteinG100g: 6.3,
      carbohydratesG100g: 57.5,
      fatG100g: 30.9,
      sugarsG100g: null,
      fiberG100g: null,
      saltG100g: null,
      servingSize: null,
      energyKcalServing: null,
      proteinGServing: null,
      carbohydratesGServing: null,
      fatGServing: null,
    }),
  ).toBe('P 6,3 g · C 57,5 g · G 30,9 g')
})
