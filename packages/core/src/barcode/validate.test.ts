import { expect, test } from 'vitest'
import { DomainError } from '../errors.js'
import { validateBarcode } from './validate.js'

test('accepts EAN-8, EAN-13, and UPC-A as digit strings', () => {
  expect(validateBarcode('90311017')).toBe('90311017')
  expect(validateBarcode('3017620422003')).toBe('3017620422003')
  expect(validateBarcode('041196910014')).toBe('041196910014')
})

test('preserves leading zeros and does not convert to Number', () => {
  expect(validateBarcode('01234565')).toBe('01234565')
  expect(validateBarcode(' 01234565 ')).toBe('01234565')
  expect(validateBarcode('01234565')).not.toBe(String(Number('01234565')))
})

test('rejects non-digits and unreasonable lengths', () => {
  expect(() => validateBarcode('301762042200X')).toThrow(DomainError)
  expect(() => validateBarcode('12345')).toThrow(DomainError)
  expect(() => validateBarcode('123456789012345')).toThrow(DomainError)
  expect(() => validateBarcode(3017620422003)).toThrow(DomainError)
  expect(() => validateBarcode(null)).toThrow(DomainError)
})

test('does not pad barcodes locally', () => {
  expect(validateBarcode('01234565')).toHaveLength(8)
  expect(validateBarcode('041196910014')).toHaveLength(12)
})
