import { expect, test } from 'vitest'
import { createAuth } from './auth'
import { app } from '../index'
import { APP_VERSION } from '../routes/health'

const TEST_SECRET = 'test-secret-at-least-32-characters-long'
const TEST_URL = 'http://localhost:5173'

function d1Like() {
  return {
    prepare() {
      return {
        bind() {
          return this
        },
        first: async () => null,
        all: async () => ({ results: [], meta: {} }),
        run: async () => ({ success: true }),
      }
    },
    batch: async () => [],
    exec: async () => ({ count: 0, duration: 0 }),
  }
}

function authEnv() {
  return {
    DB: d1Like(),
    BETTER_AUTH_SECRET: TEST_SECRET,
    BETTER_AUTH_URL: TEST_URL,
  }
}

test('createAuth initializes against a D1-like binding', () => {
  const auth = createAuth(authEnv() as CloudflareBindings)
  expect(typeof auth.handler).toBe('function')
})

test('GET /api/auth/ok is mounted as a Worker route', async () => {
  const res = await app.request('/api/auth/ok', {}, authEnv())
  expect(res.status).not.toBe(404)
  const text = await res.text()
  expect(text).not.toMatch(/<!doctype html>/i)
})

test('GET /api/v1/health remains available with auth env present', async () => {
  const env = {
    ...authEnv(),
    DB: {
      prepare(query: string) {
        expect(query).toBe('SELECT 1')
        return { first: async () => ({ '1': 1 }) }
      },
    },
  }

  const res = await app.request('/api/v1/health', {}, env)
  expect(res.status).toBe(200)
  await expect(res.json()).resolves.toEqual({
    ok: true,
    service: 'pantry',
    version: APP_VERSION,
    database: 'ok',
  })
})
