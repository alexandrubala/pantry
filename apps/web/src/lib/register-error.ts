import { REGISTER_EMAIL_INVALID_MESSAGE, REGISTER_PASSWORD_TOO_SHORT_MESSAGE } from './register-validation'

export const EMAIL_ALREADY_USED_MESSAGE = 'Există deja un cont cu acest email.'
export const GENERIC_REGISTER_FAILURE_MESSAGE = 'Nu am putut crea contul. Încearcă din nou.'
export const NETWORK_REGISTER_FAILURE_MESSAGE =
  'Nu avem conexiune. Verifică internetul și încearcă din nou.'

const EMAIL_ALREADY_USED_CODES = new Set([
  'USER_ALREADY_EXISTS',
  'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
])

const INVALID_EMAIL_CODES = new Set(['INVALID_EMAIL'])
const PASSWORD_TOO_SHORT_CODES = new Set(['PASSWORD_TOO_SHORT'])

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  return value as Record<string, unknown>
}

function readCode(error: unknown): string | null {
  const record = readRecord(error)
  if (!record) {
    return null
  }

  if (typeof record.code === 'string' && record.code.length > 0) {
    return record.code
  }

  const nested = readRecord(record.error)
  if (nested && typeof nested.code === 'string' && nested.code.length > 0) {
    return nested.code
  }

  return null
}

function readStatus(error: unknown): number | null {
  const record = readRecord(error)
  if (!record) {
    return null
  }

  if (typeof record.status === 'number') {
    return record.status
  }

  if (typeof record.statusCode === 'number') {
    return record.statusCode
  }

  return null
}

function readMessage(error: unknown): string | null {
  if (error instanceof Error && error.message) {
    return error.message
  }

  const record = readRecord(error)
  if (record && typeof record.message === 'string') {
    return record.message
  }

  return null
}

function isNetworkFailure(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true
  }

  const status = readStatus(error)
  if (status === 0) {
    return true
  }

  const record = readRecord(error)
  if (record?.name === 'TypeError') {
    return true
  }

  if (error instanceof TypeError) {
    return true
  }

  const message = readMessage(error)
  if (!message) {
    return false
  }

  return /failed to fetch|fetch failed|networkerror|network request failed|load failed|offline/i.test(
    message,
  )
}

export function mapRegisterError(error: unknown): string {
  if (isNetworkFailure(error)) {
    return NETWORK_REGISTER_FAILURE_MESSAGE
  }

  const code = readCode(error)
  if (code && EMAIL_ALREADY_USED_CODES.has(code)) {
    return EMAIL_ALREADY_USED_MESSAGE
  }

  if (code && INVALID_EMAIL_CODES.has(code)) {
    return REGISTER_EMAIL_INVALID_MESSAGE
  }

  if (code && PASSWORD_TOO_SHORT_CODES.has(code)) {
    return REGISTER_PASSWORD_TOO_SHORT_MESSAGE
  }

  const status = readStatus(error)
  if (status === 409) {
    return EMAIL_ALREADY_USED_MESSAGE
  }

  if (status === 422) {
    const message = readMessage(error)
    if (message && /already exists/i.test(message)) {
      return EMAIL_ALREADY_USED_MESSAGE
    }
  }

  return GENERIC_REGISTER_FAILURE_MESSAGE
}
