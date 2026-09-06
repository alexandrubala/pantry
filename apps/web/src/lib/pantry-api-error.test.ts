import { expect, test } from 'vitest'
import { PantryApiError } from './api'
import {
  GENERIC_PANTRY_FAILURE_MESSAGE,
  HOUSEHOLD_NAME_INVALID_MESSAGE,
  LOCATION_NAME_TAKEN_MESSAGE,
  NETWORK_PANTRY_FAILURE_MESSAGE,
  mapPantryApiError,
} from './pantry-api-error'

test('maps household and location API codes to Romanian copy', () => {
  expect(mapPantryApiError(new PantryApiError(400, 'Invalid household name', 'INVALID_HOUSEHOLD_NAME'))).toBe(
    HOUSEHOLD_NAME_INVALID_MESSAGE,
  )
  expect(mapPantryApiError(new PantryApiError(409, 'Location name already exists', 'LOCATION_NAME_TAKEN'))).toBe(
    LOCATION_NAME_TAKEN_MESSAGE,
  )
})

test('maps network failures without exposing backend strings', () => {
  expect(mapPantryApiError(new PantryApiError(0, 'Network error', 'NETWORK'))).toBe(
    NETWORK_PANTRY_FAILURE_MESSAGE,
  )
  const message = mapPantryApiError(new PantryApiError(500, 'D1_ERROR: SQLITE_ERROR', null))
  expect(message).toBe(GENERIC_PANTRY_FAILURE_MESSAGE)
  expect(message).not.toMatch(/D1_ERROR|SQLITE/)
})
