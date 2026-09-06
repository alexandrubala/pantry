import { expect, test } from 'vitest'
import {
  MIN_PASSWORD_LENGTH,
  REGISTER_EMAIL_INVALID_MESSAGE,
  REGISTER_NAME_REQUIRED_MESSAGE,
  REGISTER_PASSWORD_MISMATCH_MESSAGE,
  REGISTER_PASSWORD_TOO_SHORT_MESSAGE,
  validateRegisterInput,
} from './register-validation'

test('accepts a valid registration payload and trims name and email', () => {
  expect(
    validateRegisterInput({
      name: '  Pantry Local  ',
      email: '  local-register-test@example.invalid  ',
      password: 'password1',
      confirmPassword: 'password1',
    }),
  ).toEqual({
    ok: true,
    name: 'Pantry Local',
    email: 'local-register-test@example.invalid',
    password: 'password1',
  })
})

test('requires a non-empty name', () => {
  expect(
    validateRegisterInput({
      name: '   ',
      email: 'local@example.invalid',
      password: 'password1',
      confirmPassword: 'password1',
    }),
  ).toEqual({
    ok: false,
    field: 'name',
    message: REGISTER_NAME_REQUIRED_MESSAGE,
  })
})

test('rejects an invalid-looking email', () => {
  expect(
    validateRegisterInput({
      name: 'Pantry Local',
      email: 'not-an-email',
      password: 'password1',
      confirmPassword: 'password1',
    }),
  ).toEqual({
    ok: false,
    field: 'email',
    message: REGISTER_EMAIL_INVALID_MESSAGE,
  })
})

test('requires Better Auth minimum password length', () => {
  expect(MIN_PASSWORD_LENGTH).toBe(8)
  expect(
    validateRegisterInput({
      name: 'Pantry Local',
      email: 'local@example.invalid',
      password: 'short',
      confirmPassword: 'short',
    }),
  ).toEqual({
    ok: false,
    field: 'password',
    message: REGISTER_PASSWORD_TOO_SHORT_MESSAGE,
  })
})

test('requires matching passwords', () => {
  expect(
    validateRegisterInput({
      name: 'Pantry Local',
      email: 'local@example.invalid',
      password: 'password1',
      confirmPassword: 'password2',
    }),
  ).toEqual({
    ok: false,
    field: 'confirmPassword',
    message: REGISTER_PASSWORD_MISMATCH_MESSAGE,
  })
})
