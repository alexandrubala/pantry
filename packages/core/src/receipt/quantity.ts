import type { Unit } from '../product/units.js'
import type { ReceiptDraftItem, ReceiptProductMatch, ReceiptWeightUnit } from './types.js'

function convertWeight(
  value: number,
  from: ReceiptWeightUnit,
  to: Unit,
): number | null {
  if (from === 'g' && to === 'g') {
    return value
  }
  if (from === 'kg' && to === 'g') {
    return value * 1000
  }
  if (from === 'ml' && to === 'ml') {
    return value
  }
  if (from === 'l' && to === 'ml') {
    return value * 1000
  }
  return null
}

export type ReceiptQuantitySuggestion = {
  quantity: number
  unit: Unit
}

/**
 * Suggest import quantity. Never infer grams/ml from price.
 * Unknown package net quantity stays 1 package for new products.
 */
export function suggestReceiptImportQuantity(input: {
  item: ReceiptDraftItem
  product: ReceiptProductMatch | null
}): ReceiptQuantitySuggestion {
  const { item, product } = input
  const lineQty = item.quantity != null && item.quantity > 0 ? item.quantity : 1

  if (item.weightValue != null && item.weightUnit) {
    const targetUnit: Unit =
      item.weightUnit === 'g' || item.weightUnit === 'kg'
        ? 'g'
        : 'ml'
    if (!product || product.unit === targetUnit) {
      const converted = convertWeight(item.weightValue, item.weightUnit, targetUnit)
      if (converted != null && converted > 0) {
        return { quantity: converted, unit: targetUnit }
      }
    }
  }

  if (product) {
    if (
      product.packageQuantity != null &&
      product.packageQuantity > 0 &&
      product.packageUnit === product.unit &&
      (item.unit === 'package' || item.unit == null)
    ) {
      return {
        quantity: product.packageQuantity * lineQty,
        unit: product.unit,
      }
    }

    if (item.unit === product.unit && item.quantity != null && item.quantity > 0) {
      return { quantity: item.quantity, unit: product.unit }
    }

    if (item.unit == null && item.quantity != null && item.quantity > 0) {
      return { quantity: item.quantity, unit: product.unit }
    }

    return { quantity: lineQty, unit: product.unit }
  }

  if (item.unit === 'g' || item.unit === 'ml' || item.unit === 'each' || item.unit === 'package') {
    return { quantity: lineQty, unit: item.unit }
  }

  return { quantity: lineQty, unit: 'package' }
}
