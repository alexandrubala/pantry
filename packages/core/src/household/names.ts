import { DomainError } from '../errors.js'

export const MAX_HOUSEHOLD_NAME_LENGTH = 80
export const DEFAULT_HOUSEHOLD_NAME = 'Casa mea'

export function validateHouseholdName(value: string): string {
  const name = value.trim()

  if (!name) {
    throw new DomainError('INVALID_HOUSEHOLD_NAME', 'Invalid household name')
  }

  if (name.length > MAX_HOUSEHOLD_NAME_LENGTH) {
    throw new DomainError('INVALID_HOUSEHOLD_NAME', 'Invalid household name')
  }

  return name
}
