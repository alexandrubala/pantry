const DEFAULT_POST_AUTH_PATH = '/inventory'
const AUTH_PATHS = new Set(['/login', '/register'])

export function resolvePostLoginPath(from: unknown): string {
  if (typeof from !== 'string') {
    return DEFAULT_POST_AUTH_PATH
  }

  if (!from.startsWith('/') || from.startsWith('//') || from.includes('\\')) {
    return DEFAULT_POST_AUTH_PATH
  }

  const path = from.split(/[?#]/, 1)[0] ?? from
  if (path === '' || path === '/' || AUTH_PATHS.has(path)) {
    return DEFAULT_POST_AUTH_PATH
  }

  return from
}

export function readReturnTo(state: unknown): unknown {
  if (!state || typeof state !== 'object' || !('from' in state)) {
    return undefined
  }

  return (state as { from: unknown }).from
}
