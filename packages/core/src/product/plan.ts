import { validateProductBrand, validateProductName } from './names.js'
import { validateProductUnit, type Unit } from './units.js'

export type PlannedManualProduct = {
  id: string
  householdId: string
  name: string
  normalizedName: string
  brand: string | null
  defaultUnit: Unit
  source: 'manual'
  barcode: null
  createdAt: string
  updatedAt: string
}

export function planManualProduct(input: {
  id: string
  householdId: string
  name: string
  brand?: string | null
  unit: string
  now: string
}): PlannedManualProduct {
  const { name, normalizedName } = validateProductName(input.name)
  const brand = validateProductBrand(input.brand)
  const defaultUnit = validateProductUnit(input.unit)

  return {
    id: input.id,
    householdId: input.householdId,
    name,
    normalizedName,
    brand,
    defaultUnit,
    source: 'manual',
    barcode: null,
    createdAt: input.now,
    updatedAt: input.now,
  }
}
