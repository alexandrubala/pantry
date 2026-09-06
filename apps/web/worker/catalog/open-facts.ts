import {
  type ExternalLookupResult,
  type ExternalProductCatalog,
  validateBarcode,
} from '@pantry/core'
import { mapOpenFactsProduct, type OpenFactsCatalogOrigin } from './map-open-facts.js'

export const OPEN_FOOD_FACTS_ORIGIN = 'https://world.openfoodfacts.org'
export const OPEN_PRODUCTS_FACTS_ORIGIN = 'https://world.openproductsfacts.org'
export const OPEN_FACTS_USER_AGENT = 'Pantry/0.1.0 (https://github.com/alexandrubala/pantry)'
export const OPEN_FACTS_TIMEOUT_MS = 8_000

const PRODUCT_FIELDS = [
  'code',
  'product_name',
  'product_name_en',
  'product_name_ro',
  'generic_name',
  'abbreviated_product_name',
  'brands',
  'image_front_url',
  'image_url',
  'quantity',
  'product_quantity',
  'product_quantity_unit',
  'product_type',
  'nutriments',
  'serving_size',
].join(',')

const TRUSTED_LOOKUP_ORIGINS = new Set([OPEN_FOOD_FACTS_ORIGIN, OPEN_PRODUCTS_FACTS_ORIGIN])

export type OpenFactsFetch = (
  input: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal; redirect?: 'follow' | 'error' | 'manual' },
) => Promise<Response>

function productUrl(origin: string, barcode: string): string {
  const url = new URL(`/api/v3/product/${encodeURIComponent(barcode)}`, origin)
  url.searchParams.set('fields', PRODUCT_FIELDS)
  url.searchParams.set('lc', 'ro')
  return url.toString()
}

function isTrustedOrigin(origin: string): origin is typeof OPEN_FOOD_FACTS_ORIGIN | typeof OPEN_PRODUCTS_FACTS_ORIGIN {
  return TRUSTED_LOOKUP_ORIGINS.has(origin)
}

function originForCatalog(catalog: OpenFactsCatalogOrigin): string {
  return catalog === 'open_products_facts' ? OPEN_PRODUCTS_FACTS_ORIGIN : OPEN_FOOD_FACTS_ORIGIN
}

function catalogForOrigin(origin: string): OpenFactsCatalogOrigin {
  return origin === OPEN_PRODUCTS_FACTS_ORIGIN ? 'open_products_facts' : 'open_food_facts'
}

function isNotFoundPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') {
    return false
  }

  const record = payload as Record<string, unknown>
  if (record.status === 'failure' && record.result && typeof record.result === 'object') {
    const result = record.result as Record<string, unknown>
    return result.id === 'product_not_found'
  }

  return false
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

export function createOpenFactsCatalog(input: {
  fetch?: OpenFactsFetch
  timeoutMs?: number
} = {}): ExternalProductCatalog {
  const fetchImpl = input.fetch ?? fetch
  const timeoutMs = input.timeoutMs ?? OPEN_FACTS_TIMEOUT_MS

  async function requestCatalog(
    origin: string,
    barcode: string,
  ): Promise<ExternalLookupResult> {
    const url = productUrl(origin, barcode)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetchImpl(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': OPEN_FACTS_USER_AGENT,
        },
        signal: controller.signal,
        redirect: 'manual',
      })

      if (response.status === 404) {
        return { status: 'not_found' }
      }

      if (response.status === 301 || response.status === 302 || response.status === 303 || response.status === 307 || response.status === 308) {
        const location = response.headers.get('Location')
        if (!location) {
          return { status: 'not_found' }
        }

        try {
          const redirected = new URL(location, origin)
          if (redirected.origin === OPEN_PRODUCTS_FACTS_ORIGIN) {
            return { status: 'not_found' }
          }
          if (redirected.origin === OPEN_FOOD_FACTS_ORIGIN && origin !== OPEN_FOOD_FACTS_ORIGIN) {
            return requestCatalog(OPEN_FOOD_FACTS_ORIGIN, barcode)
          }
        } catch {
          return { status: 'temporary_failure' }
        }

        return { status: 'not_found' }
      }

      if (response.status >= 500 || response.status === 429) {
        return { status: 'temporary_failure' }
      }

      if (!response.ok) {
        return { status: 'temporary_failure' }
      }

      const payload = await readJson(response)
      if (isNotFoundPayload(payload)) {
        return { status: 'not_found' }
      }

      const product = mapOpenFactsProduct({
        barcode,
        origin: catalogForOrigin(origin),
        payload,
      })

      if (!product) {
        return { status: 'not_found' }
      }

      return { status: 'found', product }
    } catch {
      return { status: 'temporary_failure' }
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    async lookupByBarcode(rawBarcode): Promise<ExternalLookupResult> {
      const barcode = validateBarcode(rawBarcode)
      const food = await requestCatalog(originForCatalog('open_food_facts'), barcode)
      if (food.status === 'found' || food.status === 'temporary_failure') {
        return food
      }

      const products = await requestCatalog(originForCatalog('open_products_facts'), barcode)
      if (products.status === 'found' || products.status === 'temporary_failure') {
        return products
      }

      return { status: 'not_found' }
    },
  }
}

export function lookupOpenFactsProduct(
  barcode: string,
  catalog = createOpenFactsCatalog(),
): Promise<ExternalLookupResult> {
  return catalog.lookupByBarcode(barcode)
}

export function isTrustedOpenFactsLookupUrl(url: string): boolean {
  try {
    return isTrustedOrigin(new URL(url).origin)
  } catch {
    return false
  }
}
