import { expect, test } from 'vitest'
import { DomainError } from '../errors.js'
import { MAX_LOCATION_NAME_LENGTH, normalizeLocationName, validateLocationName } from './names.js'

test('normalizes trim, repeated whitespace, and case', () => {
  expect(normalizeLocationName('  Beci  Nou  ')).toBe('beci nou')
  expect(normalizeLocationName('FRIGIDER')).toBe('frigider')
  expect(normalizeLocationName('Cămară')).toBe('cămară')
})

test('validateLocationName keeps display casing after trim/collapse', () => {
  expect(validateLocationName('  Beci   Mare  ')).toEqual({
    name: 'Beci Mare',
    normalizedName: 'beci mare',
  })
})

test('rejects an empty location name', () => {
  try {
    validateLocationName('   ')
    throw new Error('expected validation to fail')
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError)
    expect((error as DomainError).code).toBe('INVALID_LOCATION_NAME')
  }
})

test('rejects a location name over the max length', () => {
  expect(() => validateLocationName('x'.repeat(MAX_LOCATION_NAME_LENGTH + 1))).toThrow(DomainError)
})
