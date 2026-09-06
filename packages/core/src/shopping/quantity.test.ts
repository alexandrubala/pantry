import { expect, test } from 'vitest'
import { DomainError } from '../errors.js'
import { validateOptionalShoppingQuantity, validateOptionalShoppingUnit } from './quantity.js'

test('optional shopping quantity allows empty values and requires quantity > 0', () => {
  expect(validateOptionalShoppingQuantity(null)).toBeNull()
  expect(validateOptionalShoppingQuantity(undefined)).toBeNull()
  expect(validateOptionalShoppingQuantity('')).toBeNull()
  expect(validateOptionalShoppingQuantity(2)).toBe(2)
  expect(validateOptionalShoppingQuantity(0.5)).toBe(0.5)
  expect(() => validateOptionalShoppingQuantity(0)).toThrow(DomainError)
  expect(() => validateOptionalShoppingQuantity(-1)).toThrow(DomainError)
  expect(() => validateOptionalShoppingQuantity('2')).toThrow(DomainError)
})

test('optional shopping unit allows empty values and accepts supported units', () => {
  expect(validateOptionalShoppingUnit(null)).toBeNull()
  expect(validateOptionalShoppingUnit(undefined)).toBeNull()
  expect(validateOptionalShoppingUnit('')).toBeNull()
  expect(validateOptionalShoppingUnit('g')).toBe('g')
  expect(validateOptionalShoppingUnit('ml')).toBe('ml')
  expect(validateOptionalShoppingUnit('each')).toBe('each')
  expect(validateOptionalShoppingUnit('package')).toBe('package')
  expect(() => validateOptionalShoppingUnit('kg')).toThrow(DomainError)
  expect(() => validateOptionalShoppingUnit('buc')).toThrow(DomainError)
  expect(() => validateOptionalShoppingUnit(1)).toThrow(DomainError)
})
