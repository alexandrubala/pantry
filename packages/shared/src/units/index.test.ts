import { expect, test } from 'vitest'
import { UNITS, isUnit } from '../index'

test('shared unit placeholders are importable', () => {
  expect(UNITS).toEqual(['g', 'ml', 'each', 'package'])
  expect(isUnit('g')).toBe(true)
  expect(isUnit('kg')).toBe(false)
})
