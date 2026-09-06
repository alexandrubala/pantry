import { MAX_PRODUCT_NAME_LENGTH, normalizeProductName, validateProductName } from '../product/names.js'

export const MAX_SHOPPING_ITEM_NAME_LENGTH = MAX_PRODUCT_NAME_LENGTH

export function normalizeShoppingItemName(value: string): string {
  return normalizeProductName(value)
}

export function validateShoppingItemName(value: string): { name: string; normalizedName: string } {
  return validateProductName(value)
}
