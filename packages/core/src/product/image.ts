import { DomainError } from '../errors.js'

export const PRODUCT_MAX_IMAGE_BYTES = 3_000_000
export const PRODUCT_ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export type ProductImageContentType = (typeof PRODUCT_ALLOWED_IMAGE_TYPES)[number]

export type InspectedProductImage = {
  contentType: ProductImageContentType
  bytes: Uint8Array
}

function normalizeDeclaredType(value: string | null): string | null {
  if (!value) {
    return null
  }

  const raw = value.split(';', 1)[0]?.trim().toLowerCase() ?? ''
  if (!raw) {
    return null
  }

  return raw === 'image/jpg' ? 'image/jpeg' : raw
}

function detectRasterImageType(bytes: Uint8Array): ProductImageContentType | null {
  if (bytes.byteLength < 12) {
    return null
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }

  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png'
  }

  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }

  return null
}

export function inspectProductImage(bytes: Uint8Array, declaredType: string | null): InspectedProductImage {
  if (bytes.byteLength === 0) {
    throw new DomainError('PRODUCT_IMAGE_INVALID', 'PRODUCT_IMAGE_INVALID')
  }

  if (bytes.byteLength > PRODUCT_MAX_IMAGE_BYTES) {
    throw new DomainError('PRODUCT_IMAGE_TOO_LARGE', 'PRODUCT_IMAGE_TOO_LARGE')
  }

  const declared = normalizeDeclaredType(declaredType)
  if (declared && !(PRODUCT_ALLOWED_IMAGE_TYPES as readonly string[]).includes(declared)) {
    throw new DomainError('PRODUCT_IMAGE_INVALID', 'PRODUCT_IMAGE_INVALID')
  }

  const detected = detectRasterImageType(bytes)
  if (!detected) {
    throw new DomainError('PRODUCT_IMAGE_INVALID', 'PRODUCT_IMAGE_INVALID')
  }

  if (declared && declared !== detected) {
    throw new DomainError('PRODUCT_IMAGE_INVALID', 'PRODUCT_IMAGE_INVALID')
  }

  return { contentType: detected, bytes }
}
