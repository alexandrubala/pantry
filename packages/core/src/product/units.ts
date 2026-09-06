import { UNITS, isUnit, type Unit } from '@pantry/shared'
import { DomainError } from '../errors.js'

export { UNITS, isUnit, type Unit }

export function validateProductUnit(value: string): Unit {
  if (!isUnit(value)) {
    throw new DomainError('INVALID_UNIT', 'Invalid unit')
  }

  return value
}
