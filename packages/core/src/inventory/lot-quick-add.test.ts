import { expect, test } from 'vitest'
import { lotQuickAddStep } from './lot-quick-add.js'

test('discrete units add one without guessing a package size', () => {
  expect(lotQuickAddStep({ unit: 'each', packageQuantity: null, packageUnit: null })).toEqual({
    quantity: 1,
    asPackage: false,
  })
  expect(lotQuickAddStep({ unit: 'package', packageQuantity: 500, packageUnit: 'g' })).toEqual({
    quantity: 1,
    asPackage: false,
  })
})

test('g/ml add one package only when metadata matches the canonical unit', () => {
  expect(lotQuickAddStep({ unit: 'g', packageQuantity: 500, packageUnit: 'g' })).toEqual({
    quantity: 500,
    asPackage: true,
  })
  expect(lotQuickAddStep({ unit: 'ml', packageQuantity: 750, packageUnit: 'ml' })).toEqual({
    quantity: 750,
    asPackage: true,
  })
})

test('does not guess a package size when metadata is missing or mismatched', () => {
  expect(lotQuickAddStep({ unit: 'g', packageQuantity: null, packageUnit: null })).toBeNull()
  expect(lotQuickAddStep({ unit: 'g', packageQuantity: 500, packageUnit: 'ml' })).toBeNull()
  expect(lotQuickAddStep({ unit: 'g', packageQuantity: 0, packageUnit: 'g' })).toBeNull()
})
