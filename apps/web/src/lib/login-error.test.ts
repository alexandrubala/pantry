import { expect, test } from 'vitest'
import {
  GENERIC_LOGIN_FAILURE_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  NETWORK_LOGIN_FAILURE_MESSAGE,
  mapLoginError,
} from './login-error'

test('maps invalid credential codes to a generic Romanian credentials message', () => {
  expect(mapLoginError({ code: 'INVALID_EMAIL_OR_PASSWORD', status: 401 })).toBe(
    INVALID_CREDENTIALS_MESSAGE,
  )
  expect(mapLoginError({ code: 'USER_NOT_FOUND', status: 401 })).toBe(
    INVALID_CREDENTIALS_MESSAGE,
  )
  expect(mapLoginError({ code: 'INVALID_PASSWORD' })).toBe(INVALID_CREDENTIALS_MESSAGE)
})

test('maps 401 and 403 without a code to the same credentials message', () => {
  expect(mapLoginError({ status: 401, message: 'Invalid email or password' })).toBe(
    INVALID_CREDENTIALS_MESSAGE,
  )
  expect(mapLoginError({ status: 403 })).toBe(INVALID_CREDENTIALS_MESSAGE)
})

test('maps network failures to a Romanian offline message', () => {
  expect(mapLoginError({ status: 0, message: 'Failed to fetch' })).toBe(
    NETWORK_LOGIN_FAILURE_MESSAGE,
  )
  expect(mapLoginError(new TypeError('Failed to fetch'))).toBe(NETWORK_LOGIN_FAILURE_MESSAGE)
})

test('does not expose raw backend messages for generic failures', () => {
  const message = mapLoginError({
    status: 500,
    message: 'D1_ERROR: SQLITE_ERROR internal stack',
    code: 'FAILED_TO_GET_SESSION',
  })
  expect(message).toBe(GENERIC_LOGIN_FAILURE_MESSAGE)
  expect(message).not.toMatch(/D1_ERROR|SQLITE|internal stack/i)
})
