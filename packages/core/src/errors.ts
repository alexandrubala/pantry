export const DOMAIN_ERROR_CODES = [
  'INVALID_HOUSEHOLD_NAME',
  'INVALID_LOCATION_NAME',
  'LOCATION_NAME_TAKEN',
  'HOUSEHOLD_REQUIRED',
  'NOT_FOUND',
  'FORBIDDEN',
  'OWNER_CANNOT_LEAVE',
  'OWNER_CANNOT_REMOVE_SELF',
  'INVITE_EXPIRED',
  'INVITE_REVOKED',
  'INVITE_ALREADY_ACCEPTED',
  'INVALID_PRODUCT_NAME',
  'INVALID_BRAND',
  'INVALID_UNIT',
  'INVALID_BARCODE',
  'BARCODE_TAKEN',
  'INVALID_QUANTITY',
  'INVALID_EXPIRY',
  'INSUFFICIENT_STOCK',
  'STOCK_CONFLICT',
  'INVENTORY_CHANGED',
  'UNIT_IMMUTABLE',
  'SHOPPING_UNIT_CONFLICT',
  'EMPTY_INVENTORY',
  'INVALID_GENERATION_REQUEST',
  'AI_RATE_LIMIT',
  'AI_GENERATION_FAILED',
  'AI_UNAVAILABLE',
  'CONSTRAINT_NOT_MET',
] as const

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number]

export class DomainError extends Error {
  readonly code: DomainErrorCode
  readonly available?: number
  readonly retryAfter?: number

  constructor(
    code: DomainErrorCode,
    message: string,
    options?: { available?: number; retryAfter?: number },
  ) {
    super(message)
    this.name = 'DomainError'
    this.code = code
    this.available = options?.available
    this.retryAfter = options?.retryAfter
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError
}

export function httpStatusForDomainError(
  code: DomainErrorCode,
): 400 | 403 | 404 | 409 | 410 | 422 | 429 | 503 {
  switch (code) {
    case 'INVALID_HOUSEHOLD_NAME':
    case 'INVALID_LOCATION_NAME':
    case 'INVALID_PRODUCT_NAME':
    case 'INVALID_BRAND':
    case 'INVALID_UNIT':
    case 'INVALID_BARCODE':
    case 'INVALID_QUANTITY':
    case 'INVALID_EXPIRY':
    case 'INVALID_GENERATION_REQUEST':
      return 400
    case 'FORBIDDEN':
      return 403
    case 'NOT_FOUND':
      return 404
    case 'LOCATION_NAME_TAKEN':
    case 'HOUSEHOLD_REQUIRED':
    case 'BARCODE_TAKEN':
    case 'INSUFFICIENT_STOCK':
    case 'STOCK_CONFLICT':
    case 'INVENTORY_CHANGED':
    case 'UNIT_IMMUTABLE':
    case 'SHOPPING_UNIT_CONFLICT':
    case 'EMPTY_INVENTORY':
    case 'OWNER_CANNOT_LEAVE':
    case 'OWNER_CANNOT_REMOVE_SELF':
      return 409
    case 'INVITE_EXPIRED':
    case 'INVITE_REVOKED':
    case 'INVITE_ALREADY_ACCEPTED':
      return 410
    case 'AI_GENERATION_FAILED':
    case 'CONSTRAINT_NOT_MET':
      return 422
    case 'AI_RATE_LIMIT':
      return 429
    case 'AI_UNAVAILABLE':
      return 503
  }
}
