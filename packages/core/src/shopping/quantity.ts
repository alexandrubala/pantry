import { DomainError } from '../errors.js'
import { validateQuantity } from '../inventory/quantity.js'
import { validateProductUnit, type Unit } from '../product/units.js'

export function validateOptionalShoppingQuantity(value: unknown): number | null {
  if (value == null || value === '') {
    return null
  }

  return validateQuantity(value)
}

export function validateOptionalShoppingUnit(value: unknown): Unit | null {
  if (value == null || value === '') {
    return null
  }

  if (typeof value !== 'string') {
    throw new DomainError('INVALID_UNIT', 'Invalid unit')
  }

  return validateProductUnit(value)
}
