import { expect, test } from 'vitest'
import { DomainError } from '../errors.js'
import { PRODUCT_MAX_IMAGE_BYTES, inspectProductImage } from './image.js'

const jpeg = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01)
const png = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d)
const webp = Uint8Array.of(
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
)
const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')

test('accepts jpeg, png, and webp by magic bytes', () => {
  expect(inspectProductImage(jpeg, 'image/jpeg').contentType).toBe('image/jpeg')
  expect(inspectProductImage(jpeg, 'image/jpg').contentType).toBe('image/jpeg')
  expect(inspectProductImage(png, 'image/png').contentType).toBe('image/png')
  expect(inspectProductImage(webp, 'image/webp').contentType).toBe('image/webp')
  expect(inspectProductImage(jpeg, null).contentType).toBe('image/jpeg')
})

test('rejects svg, empty, oversized, and fake mime signatures', () => {
  expect(() => inspectProductImage(svg, 'image/svg+xml')).toThrow(DomainError)
  expect(() => inspectProductImage(svg, 'image/jpeg')).toThrow(DomainError)
  expect(() => inspectProductImage(new Uint8Array(), 'image/jpeg')).toThrow(DomainError)
  expect(() => inspectProductImage(new Uint8Array(PRODUCT_MAX_IMAGE_BYTES + 1), 'image/jpeg')).toThrow(
    DomainError,
  )
  expect(() => inspectProductImage(png, 'image/jpeg')).toThrow(DomainError)
  expect(() => inspectProductImage(jpeg, 'text/html')).toThrow(DomainError)
})
