import { expect, test } from 'vitest'
import { PantryApiError } from './api'
import {
  GENERIC_PANTRY_FAILURE_MESSAGE,
  HOUSEHOLD_NAME_INVALID_MESSAGE,
  LOCATION_NAME_TAKEN_MESSAGE,
  NETWORK_PANTRY_FAILURE_MESSAGE,
  PRODUCT_NAME_INVALID_MESSAGE,
  STOCK_CONFLICT_MESSAGE,
  SHOPPING_UNIT_CONFLICT_MESSAGE,
  CATALOG_UNAVAILABLE_MESSAGE,
  BARCODE_INVALID_MESSAGE,
  insufficientStockMessage,
  EMPTY_INVENTORY_MESSAGE,
  AI_UNAVAILABLE_MESSAGE,
  mapPantryApiError,
} from './pantry-api-error'

test('maps household, location, and inventory API codes to Romanian copy', () => {
  expect(mapPantryApiError(new PantryApiError(400, 'Invalid household name', 'INVALID_HOUSEHOLD_NAME'))).toBe(
    HOUSEHOLD_NAME_INVALID_MESSAGE,
  )
  expect(mapPantryApiError(new PantryApiError(409, 'Location name already exists', 'LOCATION_NAME_TAKEN'))).toBe(
    LOCATION_NAME_TAKEN_MESSAGE,
  )
  expect(mapPantryApiError(new PantryApiError(400, 'Invalid product name', 'INVALID_PRODUCT_NAME'))).toBe(
    PRODUCT_NAME_INVALID_MESSAGE,
  )
  expect(mapPantryApiError(new PantryApiError(409, 'STOCK_CONFLICT', 'STOCK_CONFLICT'))).toBe(
    STOCK_CONFLICT_MESSAGE,
  )
  expect(mapPantryApiError(new PantryApiError(409, 'SHOPPING_UNIT_CONFLICT', 'SHOPPING_UNIT_CONFLICT'))).toBe(
    SHOPPING_UNIT_CONFLICT_MESSAGE,
  )
  expect(mapPantryApiError(new PantryApiError(400, 'Invalid barcode', 'INVALID_BARCODE'))).toBe(
    BARCODE_INVALID_MESSAGE,
  )
  expect(mapPantryApiError(new PantryApiError(503, 'Catalog temporarily unavailable', 'CATALOG_UNAVAILABLE'))).toBe(
    CATALOG_UNAVAILABLE_MESSAGE,
  )
  expect(mapPantryApiError(new PantryApiError(409, 'EMPTY_INVENTORY', 'EMPTY_INVENTORY'))).toBe(
    EMPTY_INVENTORY_MESSAGE,
  )
  expect(mapPantryApiError(new PantryApiError(503, 'AI_UNAVAILABLE', 'AI_UNAVAILABLE'))).toBe(
    AI_UNAVAILABLE_MESSAGE,
  )
  expect(
    mapPantryApiError(new PantryApiError(409, 'INSUFFICIENT_STOCK', 'INSUFFICIENT_STOCK', 100)),
  ).toBe(insufficientStockMessage('100'))
})

test('maps network failures without exposing backend strings', () => {
  expect(mapPantryApiError(new PantryApiError(0, 'Network error', 'NETWORK'))).toBe(
    NETWORK_PANTRY_FAILURE_MESSAGE,
  )
  const message = mapPantryApiError(new PantryApiError(500, 'D1_ERROR: SQLITE_ERROR', null))
  expect(message).toBe(GENERIC_PANTRY_FAILURE_MESSAGE)
  expect(message).not.toMatch(/D1_ERROR|SQLITE/)
})
