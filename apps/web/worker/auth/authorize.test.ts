import { expect, test } from 'vitest'
import { DomainError } from '@pantry/core'
import { requireHouseholdMember, requireHouseholdOwner } from './authorize'

const owner = {
  householdId: 'h1',
  name: 'Casa mea',
  role: 'owner' as const,
}

const member = {
  householdId: 'h1',
  name: 'Casa mea',
  role: 'member' as const,
}

test('requireHouseholdMember hides missing memberships as not found', () => {
  expect(() => requireHouseholdMember(null)).toThrow(DomainError)
  expect(() => requireHouseholdMember(null)).toThrowError(/Not found/)
  expect(requireHouseholdMember(member)).toEqual(member)
})

test('requireHouseholdOwner forbids members of the current household', () => {
  expect(() => requireHouseholdOwner(member)).toThrow(DomainError)
  expect(() => requireHouseholdOwner(member)).toThrowError(/Forbidden/)
  expect(() => requireHouseholdOwner(null)).toThrowError(/Not found/)
  expect(requireHouseholdOwner(owner)).toEqual(owner)
})
