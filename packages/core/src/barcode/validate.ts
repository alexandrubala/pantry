import { DomainError } from '../errors.js'

export const MIN_BARCODE_LENGTH = 6
export const MAX_BARCODE_LENGTH = 14

export function validateBarcode(value: unknown): string {
  if (typeof value !== 'string') {
    throw new DomainError('INVALID_BARCODE', 'Invalid barcode')
  }

  const barcode = value.trim()
  if (!/^\d+$/.test(barcode)) {
    throw new DomainError('INVALID_BARCODE', 'Invalid barcode')
  }

  if (barcode.length < MIN_BARCODE_LENGTH || barcode.length > MAX_BARCODE_LENGTH) {
    throw new DomainError('INVALID_BARCODE', 'Invalid barcode')
  }

  return barcode
}
