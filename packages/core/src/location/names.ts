import { DomainError } from '../errors.js'

export const MAX_LOCATION_NAME_LENGTH = 80

export function normalizeLocationName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ro-RO')
}

export function validateLocationName(value: string): { name: string; normalizedName: string } {
  const name = value.trim().replace(/\s+/g, ' ')

  if (!name) {
    throw new DomainError('INVALID_LOCATION_NAME', 'Invalid location name')
  }

  if (name.length > MAX_LOCATION_NAME_LENGTH) {
    throw new DomainError('INVALID_LOCATION_NAME', 'Invalid location name')
  }

  const normalizedName = normalizeLocationName(name)
  if (!normalizedName) {
    throw new DomainError('INVALID_LOCATION_NAME', 'Invalid location name')
  }

  return { name, normalizedName }
}
