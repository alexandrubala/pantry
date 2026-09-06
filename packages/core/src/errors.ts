export const DOMAIN_ERROR_CODES = [
  'INVALID_HOUSEHOLD_NAME',
  'INVALID_LOCATION_NAME',
  'LOCATION_NAME_TAKEN',
  'HOUSEHOLD_REQUIRED',
  'NOT_FOUND',
] as const

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number]

export class DomainError extends Error {
  readonly code: DomainErrorCode

  constructor(code: DomainErrorCode, message: string) {
    super(message)
    this.name = 'DomainError'
    this.code = code
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError
}

export function httpStatusForDomainError(code: DomainErrorCode): 400 | 404 | 409 {
  switch (code) {
    case 'INVALID_HOUSEHOLD_NAME':
    case 'INVALID_LOCATION_NAME':
      return 400
    case 'NOT_FOUND':
      return 404
    case 'LOCATION_NAME_TAKEN':
    case 'HOUSEHOLD_REQUIRED':
      return 409
  }
}
