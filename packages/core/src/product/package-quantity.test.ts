import { expect, test } from 'vitest'
import { defaultUnitFromPackage, inferPackageQuantity } from './package-quantity.js'

test('parses gram and millilitre package quantities', () => {
  expect(inferPackageQuantity({ quantityText: '500 g' })).toEqual({
    quantity: 500,
    unit: 'g',
    confident: true,
  })
  expect(inferPackageQuantity({ quantityText: '750 ml' })).toEqual({
    quantity: 750,
    unit: 'ml',
    confident: true,
  })
})

test('converts kg to g and l to ml', () => {
  expect(inferPackageQuantity({ quantityText: '1 kg' })).toEqual({
    quantity: 1000,
    unit: 'g',
    confident: true,
  })
  expect(inferPackageQuantity({ quantityText: '1 l' })).toEqual({
    quantity: 1000,
    unit: 'ml',
    confident: true,
  })
})

test('does not guess ambiguous package quantities', () => {
  expect(inferPackageQuantity({ quantityText: '2 x 500 g' })).toEqual({
    quantity: null,
    unit: null,
    confident: false,
  })
  expect(inferPackageQuantity({ quantityText: '500' })).toEqual({
    quantity: null,
    unit: null,
    confident: false,
  })
  expect(inferPackageQuantity({ quantityText: '1 pack' })).toEqual({
    quantity: null,
    unit: null,
    confident: false,
  })
  expect(defaultUnitFromPackage({ quantity: null, unit: null, confident: false })).toBe('package')
})

test('rejects conflicting numeric and text quantities', () => {
  expect(
    inferPackageQuantity({
      quantityText: '500 g',
      productQuantity: 1,
      productQuantityUnit: 'kg',
    }),
  ).toEqual({ quantity: null, unit: null, confident: false })
})
