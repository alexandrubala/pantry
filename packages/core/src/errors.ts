export const DOMAIN_ERROR_CODES = [
  'INVALID_HOUSEHOLD_NAME',
  'INVALID_LOCATION_NAME',
  'LOCATION_NAME_TAKEN',
  'HOUSEHOLD_REQUIRED',
  'NOT_FOUND',
  'INVALID_PRODUCT_NAME',
  'INVALID_BRAND',
  'INVALID_UNIT',
  'INVALID_QUANTITY',
  'INVALID_EXPIRY',
  'INSUFFICIENT_STOCK',
  'STOCK_CONFLICT',
] as const

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number]

export class DomainError extends Error {
  readonly code: DomainErrorCode
  readonly available?: number

  constructor(code: DomainErrorCode, message: string, options?: { available?: number }) {
    super(message)
    this.name = 'DomainError'
    this.code = code
    this.available = options?.available
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError
}

export function httpStatusForDomainError(code: DomainErrorCode): 400 | 404 | 409 {
  switch (code) {
    case 'INVALID_HOUSEHOLD_NAME':
    case 'INVALID_LOCATION_NAME':
    case 'INVALID_PRODUCT_NAME':
    case 'INVALID_BRAND':
    case 'INVALID_UNIT':
    case 'INVALID_QUANTITY':
    case 'INVALID_EXPIRY':
      return 400
    case 'NOT_FOUND':
      return 404
    case 'LOCATION_NAME_TAKEN':
    case 'HOUSEHOLD_REQUIRED':
    case 'INSUFFICIENT_STOCK':
    case 'STOCK_CONFLICT':
      return 409
  }
}
