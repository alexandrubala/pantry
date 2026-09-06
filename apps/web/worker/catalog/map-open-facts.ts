import {
  defaultUnitFromPackage,
  inferPackageQuantity,
  isEmptyNutrition,
  type ExternalCatalogId,
  type ExternalProduct,
  type ProductNutrition,
} from '@pantry/core'

const TRUSTED_IMAGE_HOST_SUFFIXES = ['.openfoodfacts.org', '.openproductsfacts.org'] as const
const TRUSTED_IMAGE_HOSTS = new Set([
  'images.openfoodfacts.org',
  'static.openfoodfacts.org',
  'images.openproductsfacts.org',
  'static.openproductsfacts.org',
])

export type OpenFactsCatalogOrigin = 'open_food_facts' | 'open_products_facts'

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const text = readString(value)
    if (text) {
      return text
    }
  }

  return null
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }

  return value
}

function readNutrient(nutriments: Record<string, unknown>, key: string): number | null {
  if (!Object.prototype.hasOwnProperty.call(nutriments, key)) {
    return null
  }

  return readFiniteNumber(nutriments[key])
}

export function sanitizeOpenFactsImageUrl(value: unknown): string | null {
  const raw = readString(value)
  if (!raw) {
    return null
  }

  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') {
      return null
    }

    const host = url.hostname.toLowerCase()
    if (TRUSTED_IMAGE_HOSTS.has(host)) {
      return url.toString()
    }

    if (TRUSTED_IMAGE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
      return url.toString()
    }

    return null
  } catch {
    return null
  }
}

export function mapOpenFactsNutrition(product: Record<string, unknown>): ProductNutrition | null {
  const nutriments = readRecord(product.nutriments)
  if (!nutriments) {
    const servingSizeOnly = readString(product.serving_size)
    if (!servingSizeOnly) {
      return null
    }

    return {
      energyKcal100g: null,
      proteinG100g: null,
      carbohydratesG100g: null,
      fatG100g: null,
      sugarsG100g: null,
      fiberG100g: null,
      saltG100g: null,
      servingSize: servingSizeOnly,
      energyKcalServing: null,
      proteinGServing: null,
      carbohydratesGServing: null,
      fatGServing: null,
    }
  }

  const nutrition: ProductNutrition = {
    energyKcal100g: readNutrient(nutriments, 'energy-kcal_100g'),
    proteinG100g: readNutrient(nutriments, 'proteins_100g'),
    carbohydratesG100g: readNutrient(nutriments, 'carbohydrates_100g'),
    fatG100g: readNutrient(nutriments, 'fat_100g'),
    sugarsG100g: readNutrient(nutriments, 'sugars_100g'),
    fiberG100g: readNutrient(nutriments, 'fiber_100g'),
    saltG100g: readNutrient(nutriments, 'salt_100g'),
    servingSize: readString(product.serving_size),
    energyKcalServing: readNutrient(nutriments, 'energy-kcal_serving'),
    proteinGServing: readNutrient(nutriments, 'proteins_serving'),
    carbohydratesGServing: readNutrient(nutriments, 'carbohydrates_serving'),
    fatGServing: readNutrient(nutriments, 'fat_serving'),
  }

  return isEmptyNutrition(nutrition) ? null : nutrition
}

function catalogFromOrigin(
  origin: OpenFactsCatalogOrigin,
  productType: string | null,
): ExternalCatalogId {
  if (origin === 'open_products_facts' || productType === 'product') {
    return 'open_products_facts'
  }

  return 'open_food_facts'
}

export function mapOpenFactsProduct(input: {
  barcode: string
  origin: OpenFactsCatalogOrigin
  payload: unknown
}): ExternalProduct | null {
  const body = readRecord(input.payload)
  const product = readRecord(body?.product)
  if (!product) {
    return null
  }

  const name = firstString(
    product.product_name,
    product.product_name_ro,
    product.product_name_en,
    product.generic_name,
    product.abbreviated_product_name,
  )
  const brand = readString(product.brands)
  const quantityText = readString(product.quantity)
  const packageInference = inferPackageQuantity({
    quantityText,
    productQuantity: readFiniteNumber(product.product_quantity),
    productQuantityUnit: readString(product.product_quantity_unit),
  })
  const productType = readString(product.product_type)
  const catalog = catalogFromOrigin(input.origin, productType)

  return {
    barcode: input.barcode,
    catalog,
    productType,
    name,
    brand,
    imageUrl: sanitizeOpenFactsImageUrl(firstString(product.image_front_url, product.image_url)),
    quantityText,
    packageQuantity: packageInference.confident ? packageInference.quantity : null,
    packageUnit: packageInference.confident ? packageInference.unit : null,
    packageQuantityConfident: packageInference.confident,
    unit: defaultUnitFromPackage(packageInference),
    nutrition: mapOpenFactsNutrition(product),
  }
}
