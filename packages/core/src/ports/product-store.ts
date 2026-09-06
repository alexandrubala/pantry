import type { Unit } from '../product/units.js'

export type ProductRecord = {
  id: string
  name: string
  brand: string | null
  unit: Unit
}

export type ProductStore = {
  createManualProduct(input: {
    householdId: string
    name: string
    brand?: string | null
    unit: string
  }): Promise<ProductRecord>
  listProducts(input: { householdId: string; search?: string | null }): Promise<ProductRecord[]>
  getReadableProduct(input: {
    householdId: string
    productId: string
  }): Promise<ProductRecord | null>
}
