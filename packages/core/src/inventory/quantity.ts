import { DomainError } from '../errors.js'

export function validateQuantity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new DomainError('INVALID_QUANTITY', 'Invalid quantity')
  }

  return value
}
