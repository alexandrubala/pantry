import { expect, test } from 'vitest'
import { DomainError } from '../errors.js'
import { MAX_SHOPPING_ITEM_NAME_LENGTH, normalizeShoppingItemName, validateShoppingItemName } from './names.js'

test('validates and normalizes shopping item names', () => {
  expect(validateShoppingItemName('  Hârtie   de  bucătărie  ')).toEqual({
    name: 'Hârtie de bucătărie',
    normalizedName: 'hârtie de bucătărie',
  })
  expect(normalizeShoppingItemName('LAPTE')).toBe('lapte')
  expect(normalizeShoppingItemName('  Ouă  ')).toBe('ouă')
})

test('rejects empty or too-long shopping item names', () => {
  expect(() => validateShoppingItemName('   ')).toThrow(DomainError)
  expect(() => validateShoppingItemName('')).toThrow(DomainError)
  expect(() => validateShoppingItemName('x'.repeat(MAX_SHOPPING_ITEM_NAME_LENGTH + 1))).toThrow(
    DomainError,
  )
})
