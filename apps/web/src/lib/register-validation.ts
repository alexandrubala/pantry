export const MIN_PASSWORD_LENGTH = 8

export const REGISTER_NAME_REQUIRED_MESSAGE = 'Introdu numele.'
export const REGISTER_EMAIL_INVALID_MESSAGE = 'Introdu un email valid.'
export const REGISTER_PASSWORD_TOO_SHORT_MESSAGE = `Parola trebuie să aibă cel puțin ${MIN_PASSWORD_LENGTH} caractere.`
export const REGISTER_PASSWORD_MISMATCH_MESSAGE = 'Parolele nu coincid.'

export type RegisterInput = {
  name: string
  email: string
  password: string
  confirmPassword: string
}

export type RegisterField = 'name' | 'email' | 'password' | 'confirmPassword'

export type RegisterValidationSuccess = {
  ok: true
  name: string
  email: string
  password: string
}

export type RegisterValidationFailure = {
  ok: false
  field: RegisterField
  message: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateRegisterInput(
  input: RegisterInput,
): RegisterValidationSuccess | RegisterValidationFailure {
  const name = input.name.trim()
  if (!name) {
    return { ok: false, field: 'name', message: REGISTER_NAME_REQUIRED_MESSAGE }
  }

  const email = input.email.trim()
  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, field: 'email', message: REGISTER_EMAIL_INVALID_MESSAGE }
  }

  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, field: 'password', message: REGISTER_PASSWORD_TOO_SHORT_MESSAGE }
  }

  if (input.password !== input.confirmPassword) {
    return { ok: false, field: 'confirmPassword', message: REGISTER_PASSWORD_MISMATCH_MESSAGE }
  }

  return { ok: true, name, email, password: input.password }
}
