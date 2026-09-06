import { expect, test } from 'vitest'
import { validateMinimumQuantity, validateNonNegativeQuantity, validateQuantity } from './quantity.js'

test('validateQuantity rejects zero and non-finite values', () => {
  expect(validateQuantity(1)).toBe(1)
  expect(() => validateQuantity(0)).toThrow()
  expect(() => validateQuantity(-1)).toThrow()
  expect(() => validateQuantity(Number.NaN)).toThrow()
})

test('minimum and adjust quantities allow zero but not negatives', () => {
  expect(validateMinimumQuantity(0)).toBe(0)
  expect(validateMinimumQuantity(500)).toBe(500)
  expect(validateNonNegativeQuantity(0)).toBe(0)
  expect(() => validateMinimumQuantity(-1)).toThrow()
  expect(() => validateNonNegativeQuantity(Number.POSITIVE_INFINITY)).toThrow()
})
