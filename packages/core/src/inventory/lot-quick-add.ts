import type { Unit } from '../product/units.js'
import { isDiscreteUnit } from './consume-percent.js'

export type LotQuickAddStep = {
  quantity: number
  asPackage: boolean
}

/**
 * Direct + on a specific lot.
 * Discrete units add 1. Mass/volume add one known package only when package
 * metadata matches the product canonical unit. Otherwise the UI must prompt.
 */
export function lotQuickAddStep(product: {
  unit: Unit
  packageQuantity: number | null
  packageUnit: Unit | null
}): LotQuickAddStep | null {
  if (isDiscreteUnit(product.unit)) {
    return { quantity: 1, asPackage: false }
  }

  if (
    (product.unit === 'g' || product.unit === 'ml') &&
    typeof product.packageQuantity === 'number' &&
    Number.isFinite(product.packageQuantity) &&
    product.packageQuantity > 0 &&
    product.packageUnit === product.unit
  ) {
    return { quantity: product.packageQuantity, asPackage: true }
  }

  return null
}
