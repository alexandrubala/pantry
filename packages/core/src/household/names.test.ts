import { expect, test } from 'vitest'
import { DomainError } from '../errors.js'
import { MAX_HOUSEHOLD_NAME_LENGTH, validateHouseholdName } from './names.js'

test('trims a valid household name', () => {
  expect(validateHouseholdName('  Casa mea  ')).toBe('Casa mea')
})

test('rejects an empty household name', () => {
  expect(() => validateHouseholdName('   ')).toThrow(DomainError)
  expect(() => validateHouseholdName('')).toThrowError(/Invalid household name/)
})

test('rejects a household name over the max length', () => {
  const tooLong = 'a'.repeat(MAX_HOUSEHOLD_NAME_LENGTH + 1)
  try {
    validateHouseholdName(tooLong)
    throw new Error('expected validation to fail')
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError)
    expect((error as DomainError).code).toBe('INVALID_HOUSEHOLD_NAME')
  }
})

test('accepts a household name at the max length', () => {
  const name = 'a'.repeat(MAX_HOUSEHOLD_NAME_LENGTH)
  expect(validateHouseholdName(name)).toBe(name)
})
