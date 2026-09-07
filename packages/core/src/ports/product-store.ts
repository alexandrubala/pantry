import type { ExternalCatalogId } from '../ports/external-product-catalog.js'
import type { ProductNutrition } from '../product/nutrition.js'
import type { Unit } from '../product/units.js'

export type ProductRecord = {
  id: string
  name: string
  brand: string | null
  unit: Unit
  barcode: string | null
  imageUrl: string | null
  source: 'manual' | 'open_food_facts'
  externalCatalog: ExternalCatalogId | null
  externalProductType: string | null
  packageQuantity: number | null
  packageUnit: Unit | null
  nutrition: ProductNutrition | null
}

export type ProductStore = {
  createManualProduct(input: {
    householdId: string
    name: string
    brand?: string | null
    unit: string
    barcode?: string | null
  }): Promise<ProductRecord>
  listProducts(input: { householdId: string; search?: string | null }): Promise<ProductRecord[]>
  getReadableProduct(input: {
    householdId: string
    productId: string
  }): Promise<ProductRecord | null>
  findReadableByBarcode(input: {
    householdId: string
    barcode: string
  }): Promise<ProductRecord | null>
  importExternalProduct(input: {
    barcode: string
    catalog: ExternalCatalogId
    productType: string | null
    name: string | null
    brand: string | null
    unit: string
    imageUrl: string | null
    packageQuantity: number | null
    packageUnit: Unit | null
    nutrition: ProductNutrition | null
  }): Promise<ProductRecord>
  updateManualProduct(input: {
    householdId: string
    productId: string
    name?: unknown
    brand?: unknown
    unit?: unknown
  }): Promise<ProductRecord>
  createHouseholdOverrideProduct(input: {
    householdId: string
    sourceProductId: string
    unit: string
  }): Promise<ProductRecord>
}
