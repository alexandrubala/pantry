import { expect, test } from 'vitest'
import { isLowStock } from './low-stock.js'

test('minimum 10: 11 is not low, 10 and 9 are low', () => {
  expect(isLowStock(11, 10)).toBe(false)
  expect(isLowStock(10, 10)).toBe(true)
  expect(isLowStock(9, 10)).toBe(true)
})

test('minimum 0 disables low-stock', () => {
  expect(isLowStock(0, 0)).toBe(false)
  expect(isLowStock(5, 0)).toBe(false)
})

test('zero lots (total 0) with a configured minimum is low-stock', () => {
  expect(isLowStock(0, 6)).toBe(true)
})
