import { validateBarcode } from '../barcode/validate.js'
import { MAX_PRODUCT_NAME_LENGTH, validateProductBrand, validateProductName } from './names.js'
import type { ExternalCatalogId } from '../ports/external-product-catalog.js'
import { validateProductUnit, type Unit } from './units.js'

export type PlannedManualProduct = {
  id: string
  householdId: string
  name: string
  normalizedName: string
  brand: string | null
  defaultUnit: Unit
  source: 'manual'
  barcode: string | null
  createdAt: string
  updatedAt: string
}

export type PlannedExternalProduct = {
  id: string
  householdId: null
  name: string
  normalizedName: string
  brand: string | null
  defaultUnit: Unit
  source: 'open_food_facts'
  barcode: string
  imageUrl: string | null
  externalCatalog: ExternalCatalogId
  externalProductType: string | null
  packageQuantity: number | null
  packageUnit: Unit | null
  externalFetchedAt: string
  createdAt: string
  updatedAt: string
}

export function planManualProduct(input: {
  id: string
  householdId: string
  name: string
  brand?: string | null
  unit: string
  barcode?: string | null
  now: string
}): PlannedManualProduct {
  const { name, normalizedName } = validateProductName(input.name)
  const brand = validateProductBrand(input.brand)
  const defaultUnit = validateProductUnit(input.unit)
  const barcode = input.barcode == null || input.barcode === '' ? null : validateBarcode(input.barcode)

  return {
    id: input.id,
    householdId: input.householdId,
    name,
    normalizedName,
    brand,
    defaultUnit,
    source: 'manual',
    barcode,
    createdAt: input.now,
    updatedAt: input.now,
  }
}

function clipName(value: string): string {
  const name = value.trim().replace(/\s+/g, ' ')
  if (name.length <= MAX_PRODUCT_NAME_LENGTH) {
    return name
  }

  return name.slice(0, MAX_PRODUCT_NAME_LENGTH).trim()
}

export function resolveImportedProductName(input: {
  name: string | null
  brand: string | null
  barcode: string
}): { name: string; normalizedName: string } {
  const candidates = [input.name, input.brand, `Produs ${input.barcode}`]
  for (const candidate of candidates) {
    if (!candidate) {
      continue
    }

    const clipped = clipName(candidate)
    if (!clipped) {
      continue
    }

    try {
      return validateProductName(clipped)
    } catch {
      continue
    }
  }

  return validateProductName(`Produs ${input.barcode}`)
}

export function planExternalProduct(input: {
  id: string
  barcode: string
  catalog: ExternalCatalogId
  productType: string | null
  name: string | null
  brand: string | null
  unit: string
  imageUrl: string | null
  packageQuantity: number | null
  packageUnit: Unit | null
  now: string
}): PlannedExternalProduct {
  const barcode = validateBarcode(input.barcode)
  const { name, normalizedName } = resolveImportedProductName({
    name: input.name,
    brand: input.brand,
    barcode,
  })
  const brand = validateProductBrand(input.brand)
  const defaultUnit = validateProductUnit(input.unit)

  return {
    id: input.id,
    householdId: null,
    name,
    normalizedName,
    brand,
    defaultUnit,
    source: 'open_food_facts',
    barcode,
    imageUrl: input.imageUrl,
    externalCatalog: input.catalog,
    externalProductType: input.productType,
    packageQuantity: input.packageQuantity,
    packageUnit: input.packageUnit,
    externalFetchedAt: input.now,
    createdAt: input.now,
    updatedAt: input.now,
  }
}
