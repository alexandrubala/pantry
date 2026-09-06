/**
 * Low stock is deterministic from D1 totals.
 *
 * A product is low-stock when minimumQuantity > 0 and totalQuantity <= minimum.
 * Products with a configured minimum remain tracked even with zero lots
 * (totalQuantity = 0), so they still count as low-stock.
 *
 * minimumQuantity = 0 means no minimum / disabled.
 */
export function isLowStock(totalQuantity: number, minimumQuantity: number): boolean {
  return minimumQuantity > 0 && totalQuantity <= minimumQuantity
}
