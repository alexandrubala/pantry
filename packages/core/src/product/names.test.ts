import { expect, test } from 'vitest'
import { DomainError } from '../errors.js'
import { MAX_PRODUCT_NAME_LENGTH, normalizeProductName, validateProductBrand, validateProductName } from './names.js'

test('validates and normalizes product names', () => {
  expect(validateProductName('  Lapte  UHT  ')).toEqual({
    name: 'Lapte UHT',
    normalizedName: 'lapte uht',
  })
  expect(normalizeProductName('LAPTE')).toBe('lapte')
})

test('rejects empty or too-long product names', () => {
  expect(() => validateProductName('   ')).toThrow(DomainError)
  expect(() => validateProductName('x'.repeat(MAX_PRODUCT_NAME_LENGTH + 1))).toThrow(DomainError)
})

test('treats blank brand as null and rejects overly long brands', () => {
  expect(validateProductBrand(null)).toBeNull()
  expect(validateProductBrand('  ')).toBeNull()
  expect(validateProductBrand('  Pilos  ')).toBe('Pilos')
  expect(() => validateProductBrand('b'.repeat(81))).toThrow(DomainError)
})
