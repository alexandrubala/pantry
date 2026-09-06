import type { InventoryItem } from '../ports/inventory-store.js'
import type { InventoryProductContext } from './types.js'

export function buildInventoryContext(items: readonly InventoryItem[]): InventoryProductContext[] {
  return items
    .filter((item) => item.totalQuantity > 0)
    .map((item) => {
      const nutrition = item.product.nutrition
      const hasPer100g =
        nutrition != null &&
        (nutrition.energyKcal100g != null ||
          nutrition.proteinG100g != null ||
          nutrition.carbohydratesG100g != null ||
          nutrition.fatG100g != null)

      return {
        productId: item.product.id,
        name: item.product.name,
        brand: item.product.brand,
        unit: item.product.unit,
        availableQuantity: item.totalQuantity,
        packageQuantity: item.product.packageQuantity,
        packageUnit: item.product.packageUnit,
        nutrition: hasPer100g
          ? {
              energyKcal100g: nutrition.energyKcal100g,
              proteinG100g: nutrition.proteinG100g,
              carbohydratesG100g: nutrition.carbohydratesG100g,
              fatG100g: nutrition.fatG100g,
            }
          : null,
      }
    })
}

export function inventoryContextById(
  inventory: readonly InventoryProductContext[],
): Map<string, InventoryProductContext> {
  return new Map(inventory.map((item) => [item.productId, item]))
}
