import type { ProductNutrition } from '../product/nutrition.js'
import type { Unit } from '../product/units.js'

export const EXTERNAL_CATALOGS = ['open_food_facts', 'open_products_facts'] as const

export type ExternalCatalogId = (typeof EXTERNAL_CATALOGS)[number]

export type ExternalProduct = {
  barcode: string
  catalog: ExternalCatalogId
  productType: string | null
  name: string | null
  brand: string | null
  imageUrl: string | null
  quantityText: string | null
  packageQuantity: number | null
  packageUnit: Unit | null
  packageQuantityConfident: boolean
  unit: Unit
  nutrition: ProductNutrition | null
}

export type ExternalLookupResult =
  | { status: 'found'; product: ExternalProduct }
  | { status: 'not_found' }
  | { status: 'temporary_failure' }

export type ExternalProductCatalog = {
  lookupByBarcode(barcode: string): Promise<ExternalLookupResult>
}
