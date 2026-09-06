import { normalizeProductName } from '../product/names.js'
import type { ReceiptProductMatch } from './types.js'

function identityKeys(product: ReceiptProductMatch): string[] {
  const name = normalizeProductName(product.name)
  const keys = [name]
  if (product.brand) {
    const brand = normalizeProductName(product.brand)
    keys.push(normalizeProductName(`${brand} ${product.name}`))
    keys.push(normalizeProductName(`${product.name} ${brand}`))
  }
  return [...new Set(keys.filter(Boolean))]
}

/**
 * Bind a receipt line to an existing product only on a unique, deterministic name match.
 * Weak / partial / ambiguous matches stay unbound.
 */
export function matchReceiptProduct(
  lineName: string,
  products: readonly ReceiptProductMatch[],
): ReceiptProductMatch | null {
  const needle = normalizeProductName(lineName)
  if (!needle) {
    return null
  }

  const hits = products.filter((product) => identityKeys(product).includes(needle))
  if (hits.length !== 1) {
    return null
  }

  return hits[0] ?? null
}
