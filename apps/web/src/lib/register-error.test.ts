import { expect, test } from 'vitest'
import {
  EMAIL_ALREADY_USED_MESSAGE,
  GENERIC_REGISTER_FAILURE_MESSAGE,
  NETWORK_REGISTER_FAILURE_MESSAGE,
  mapRegisterError,
} from './register-error'
import { REGISTER_PASSWORD_TOO_SHORT_MESSAGE } from './register-validation'

test('maps duplicate-email codes to a Romanian already-used message', () => {
  expect(mapRegisterError({ code: 'USER_ALREADY_EXISTS', status: 422 })).toBe(
    EMAIL_ALREADY_USED_MESSAGE,
  )
  expect(mapRegisterError({ code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' })).toBe(
    EMAIL_ALREADY_USED_MESSAGE,
  )
})

test('maps 409 and duplicate 422 without a code to the already-used message', () => {
  expect(mapRegisterError({ status: 422, message: 'User already exists.' })).toBe(
    EMAIL_ALREADY_USED_MESSAGE,
  )
  expect(mapRegisterError({ status: 409 })).toBe(EMAIL_ALREADY_USED_MESSAGE)
})

test('maps password-too-short without exposing the backend string', () => {
  expect(mapRegisterError({ code: 'PASSWORD_TOO_SHORT', message: 'Password too short' })).toBe(
    REGISTER_PASSWORD_TOO_SHORT_MESSAGE,
  )
})

test('maps network failures to a Romanian offline message', () => {
  expect(mapRegisterError({ status: 0, message: 'Failed to fetch' })).toBe(
    NETWORK_REGISTER_FAILURE_MESSAGE,
  )
  expect(mapRegisterError(new TypeError('Failed to fetch'))).toBe(NETWORK_REGISTER_FAILURE_MESSAGE)
})

test('does not expose raw backend messages for generic failures', () => {
  const message = mapRegisterError({
    status: 500,
    message: 'D1_ERROR: SQLITE_ERROR internal stack',
    code: 'FAILED_TO_CREATE_USER',
  })
  expect(message).toBe(GENERIC_REGISTER_FAILURE_MESSAGE)
  expect(message).not.toMatch(/D1_ERROR|SQLITE|internal stack|FAILED_TO_CREATE_USER/i)
})
