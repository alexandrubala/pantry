import { expect, test } from 'vitest'
import { DomainError } from '../errors.js'
import { mergeShoppingQuantities, shoppingUnitsCompatible } from './merge.js'

test('merges quantities when units match', () => {
  expect(
    mergeShoppingQuantities({ quantity: 1, unit: 'package' }, { quantity: 1, unit: 'package' }),
  ).toEqual({ quantity: 2, unit: 'package' })
  expect(mergeShoppingQuantities({ quantity: 500, unit: 'g' }, { quantity: 250, unit: 'g' })).toEqual({
    quantity: 750,
    unit: 'g',
  })
  expect(mergeShoppingQuantities({ quantity: null, unit: 'each' }, { quantity: 2, unit: 'each' })).toEqual({
    quantity: 2,
    unit: 'each',
  })
  expect(mergeShoppingQuantities({ quantity: 2, unit: null }, { quantity: null, unit: null })).toEqual({
    quantity: 2,
    unit: null,
  })
})

test('rejects merges across incompatible units including g and ml', () => {
  expect(shoppingUnitsCompatible('g', 'ml')).toBe(false)
  expect(shoppingUnitsCompatible('package', 'each')).toBe(false)
  expect(shoppingUnitsCompatible('package', 'package')).toBe(true)
  expect(() =>
    mergeShoppingQuantities({ quantity: 1, unit: 'package' }, { quantity: 500, unit: 'g' }),
  ).toThrow(DomainError)
  expect(() => mergeShoppingQuantities({ quantity: 100, unit: 'g' }, { quantity: 100, unit: 'ml' })).toThrow(
    DomainError,
  )
  try {
    mergeShoppingQuantities({ quantity: 1, unit: 'each' }, { quantity: 1, unit: 'package' })
  } catch (error) {
    expect(error).toMatchObject({ code: 'SHOPPING_UNIT_CONFLICT' })
  }
})
