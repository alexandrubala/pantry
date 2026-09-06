import type { Unit } from '../product/units.js'

export type ShoppingQuantitySuggestion = {
  quantity: number
  unit: Unit
}

export function suggestShoppingQuantity(product: {
  unit: Unit
  packageQuantity?: number | null
  packageUnit?: Unit | null
}): ShoppingQuantitySuggestion | null {
  if (product.unit === 'each' || product.unit === 'package') {
    return { quantity: 1, unit: product.unit }
  }

  const packageQuantity = product.packageQuantity
  const packageUnit = product.packageUnit
  if (
    typeof packageQuantity === 'number' &&
    Number.isFinite(packageQuantity) &&
    packageQuantity > 0 &&
    packageUnit === product.unit &&
    (packageUnit === 'g' || packageUnit === 'ml')
  ) {
    return { quantity: packageQuantity, unit: packageUnit }
  }

  return null
}
