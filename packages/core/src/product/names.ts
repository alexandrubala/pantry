import { DomainError } from '../errors.js'

export const MAX_PRODUCT_NAME_LENGTH = 120
export const MAX_PRODUCT_BRAND_LENGTH = 80

export function normalizeProductName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ro-RO')
}

export function validateProductName(value: string): { name: string; normalizedName: string } {
  const name = value.trim().replace(/\s+/g, ' ')

  if (!name) {
    throw new DomainError('INVALID_PRODUCT_NAME', 'Invalid product name')
  }

  if (name.length > MAX_PRODUCT_NAME_LENGTH) {
    throw new DomainError('INVALID_PRODUCT_NAME', 'Invalid product name')
  }

  const normalizedName = normalizeProductName(name)
  if (!normalizedName) {
    throw new DomainError('INVALID_PRODUCT_NAME', 'Invalid product name')
  }

  return { name, normalizedName }
}

export function validateProductBrand(value: string | null | undefined): string | null {
  if (value == null) {
    return null
  }

  const brand = value.trim().replace(/\s+/g, ' ')
  if (!brand) {
    return null
  }

  if (brand.length > MAX_PRODUCT_BRAND_LENGTH) {
    throw new DomainError('INVALID_BRAND', 'Invalid brand')
  }

  return brand
}
