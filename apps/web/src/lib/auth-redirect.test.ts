import { expect, test } from 'vitest'
import { readReturnTo, resolvePostLoginPath } from './auth-redirect'

test('returns the captured in-app path after login', () => {
  expect(resolvePostLoginPath('/shopping')).toBe('/shopping')
  expect(resolvePostLoginPath('/scan?camera=1')).toBe('/scan?camera=1')
})

test('falls back to inventory for missing, auth, or unsafe destinations', () => {
  expect(resolvePostLoginPath(undefined)).toBe('/inventory')
  expect(resolvePostLoginPath('/')).toBe('/inventory')
  expect(resolvePostLoginPath('/login')).toBe('/inventory')
  expect(resolvePostLoginPath('/register')).toBe('/inventory')
  expect(resolvePostLoginPath('https://example.invalid')).toBe('/inventory')
  expect(resolvePostLoginPath('//evil.example')).toBe('/inventory')
  expect(resolvePostLoginPath('\\login')).toBe('/inventory')
})

test('reads the from field from router location state', () => {
  expect(readReturnTo({ from: '/shopping' })).toBe('/shopping')
  expect(readReturnTo(null)).toBeUndefined()
  expect(readReturnTo({ other: '/shopping' })).toBeUndefined()
})
