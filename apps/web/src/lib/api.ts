export class PantryApiError extends Error {
  readonly status: number
  readonly code: string | null
  readonly available: number | null
  readonly retryAfter: number | null

  constructor(
    status: number,
    error: string,
    code: string | null,
    available: number | null = null,
    retryAfter: number | null = null,
  ) {
    super(error)
    this.name = 'PantryApiError'
    this.status = status
    this.code = code
    this.available = available
    this.retryAfter = retryAfter
  }
}

export function isPantryApiError(error: unknown): error is PantryApiError {
  return error instanceof PantryApiError
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  return value as Record<string, unknown>
}

async function parseError(response: Response): Promise<PantryApiError> {
  let code: string | null = null
  let error = 'Request failed'
  let available: number | null = null
  let retryAfter: number | null = null

  try {
    const body: unknown = await response.json()
    const record = readRecord(body)
    if (record && typeof record.error === 'string' && record.error.length > 0) {
      error = record.error
    }
    if (record && typeof record.code === 'string' && record.code.length > 0) {
      code = record.code
    }
    if (record && typeof record.available === 'number' && Number.isFinite(record.available)) {
      available = record.available
    }
    if (record && typeof record.retryAfter === 'number' && Number.isFinite(record.retryAfter)) {
      retryAfter = record.retryAfter
    }
  } catch {
    error = response.statusText || error
  }

  return new PantryApiError(response.status, error, code, available, retryAfter)
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        ...(init?.body && !isFormData ? { 'content-type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new PantryApiError(0, 'Network error', 'NETWORK')
  }

  if (!response.ok) {
    throw await parseError(response)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path)
}

export function apiSend<T>(path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body?: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

export function apiSendForm<T>(path: string, body: FormData, method: 'POST' | 'PUT' = 'POST'): Promise<T> {
  return apiRequest<T>(path, {
    method,
    body,
  })
}
