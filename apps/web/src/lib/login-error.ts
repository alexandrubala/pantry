export const INVALID_CREDENTIALS_MESSAGE = 'Emailul sau parola sunt incorecte.'
export const GENERIC_LOGIN_FAILURE_MESSAGE = 'Nu te-am putut conecta. Încearcă din nou.'
export const NETWORK_LOGIN_FAILURE_MESSAGE =
  'Nu avem conexiune. Verifică internetul și încearcă din nou.'

const INVALID_CREDENTIAL_CODES = new Set([
  'INVALID_EMAIL_OR_PASSWORD',
  'INVALID_PASSWORD',
  'INVALID_EMAIL',
  'USER_NOT_FOUND',
  'CREDENTIAL_ACCOUNT_NOT_FOUND',
  'ACCOUNT_NOT_FOUND',
])

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

export function mapLoginError(error: unknown): string {
  if (isNetworkFailure(error)) {
    return NETWORK_LOGIN_FAILURE_MESSAGE
  }

  const code = readCode(error)
  if (code && INVALID_CREDENTIAL_CODES.has(code)) {
    return INVALID_CREDENTIALS_MESSAGE
  }

  const status = readStatus(error)
  if (status === 401 || status === 403) {
    return INVALID_CREDENTIALS_MESSAGE
  }

  return GENERIC_LOGIN_FAILURE_MESSAGE
}
