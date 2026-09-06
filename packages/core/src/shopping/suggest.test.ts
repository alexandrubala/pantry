import { expect, test } from 'vitest'
import { suggestShoppingQuantity } from './suggest.js'

test('suggests 1 each or 1 package from the product default unit', () => {
  expect(suggestShoppingQuantity({ unit: 'each' })).toEqual({ quantity: 1, unit: 'each' })
  expect(suggestShoppingQuantity({ unit: 'package' })).toEqual({ quantity: 1, unit: 'package' })
})

test('suggests package quantity for g/ml only when metadata matches the product unit', () => {
  expect(
    suggestShoppingQuantity({ unit: 'g', packageQuantity: 500, packageUnit: 'g' }),
  ).toEqual({ quantity: 500, unit: 'g' })
  expect(
    suggestShoppingQuantity({ unit: 'ml', packageQuantity: 1000, packageUnit: 'ml' }),
  ).toEqual({ quantity: 1000, unit: 'ml' })
  expect(suggestShoppingQuantity({ unit: 'g' })).toBeNull()
  expect(suggestShoppingQuantity({ unit: 'g', packageQuantity: 500, packageUnit: 'ml' })).toBeNull()
  expect(suggestShoppingQuantity({ unit: 'ml', packageQuantity: 1, packageUnit: 'package' })).toBeNull()
})
