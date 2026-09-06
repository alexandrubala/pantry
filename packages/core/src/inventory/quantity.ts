import { DomainError } from '../errors.js'

export function validateQuantity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new DomainError('INVALID_QUANTITY', 'Invalid quantity')
  }

  return value
}

export function validateNonNegativeQuantity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new DomainError('INVALID_QUANTITY', 'Invalid quantity')
  }

  return value
}

/** 0 disables the household minimum. Unit is always the product canonical unit. */
export function validateMinimumQuantity(value: unknown): number {
  return validateNonNegativeQuantity(value)
}
