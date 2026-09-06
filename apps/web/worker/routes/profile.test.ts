import { beforeEach, expect, test, vi } from 'vitest'

vi.mock('../auth/session.js', () => ({
  resolveCurrentUser: vi.fn(),
}))

import { resolveCurrentUser } from '../auth/session.js'
import { app } from '../index'

const resolveCurrentUserMock = vi.mocked(resolveCurrentUser)

const TEST_SECRET = 'test-secret-at-least-32-characters-long'
const TEST_URL = 'http://localhost:5173'

type ProfileRow = {
  id: string
  display_name: string
  avatar_url: string | null
  locale: string
}

function memoryDb() {
  const profiles = new Map<string, ProfileRow>()

  return {
    profiles,
    DB: {
      prepare(query: string) {
        return {
          bind(...values: unknown[]) {
            return {
              async run() {
                if (query.includes('INSERT INTO profiles')) {
                  const id = String(values[0])
                  if (!profiles.has(id)) {
                    profiles.set(id, {
                      id,
                      display_name: String(values[1]),
                      avatar_url: null,
                      locale: 'ro',
                    })
                  }
                }
                return { success: true }
              },
              async first() {
                return profiles.get(String(values[0])) ?? null
              },
            }
          },
        }
      },
    },
  }
}

function envWith(db: ReturnType<typeof memoryDb>['DB']) {
  return {
    DB: db,
    BETTER_AUTH_SECRET: TEST_SECRET,
    BETTER_AUTH_URL: TEST_URL,
  }
}

beforeEach(() => {
  resolveCurrentUserMock.mockReset()
  resolveCurrentUserMock.mockResolvedValue(null)
})

test('GET /api/v1/profile without a session returns 401', async () => {
  const { DB } = memoryDb()
  const res = await app.request('/api/v1/profile', {}, envWith(DB))

  expect(res.status).toBe(401)
  await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
})

test('GET /api/v1/profile returns the current user profile after ensureProfile', async () => {
  const { DB, profiles } = memoryDb()
  resolveCurrentUserMock.mockResolvedValue({
    id: 'user-1',
    name: 'Pantry Test',
  })

  const res = await app.request('/api/v1/profile', {}, envWith(DB))
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body).toEqual({
    id: 'user-1',
    displayName: 'Pantry Test',
    avatarUrl: null,
    locale: 'ro',
  })
  expect(body).not.toHaveProperty('password')
  expect(body).not.toHaveProperty('session')
  expect(body).not.toHaveProperty('token')
  expect(profiles.size).toBe(1)

  const again = await app.request('/api/v1/profile', {}, envWith(DB))
  expect(again.status).toBe(200)
  await expect(again.json()).resolves.toEqual(body)
  expect(profiles.size).toBe(1)
})

test('GET /api/v1/profiles/:id is not implemented', async () => {
  const { DB } = memoryDb()
  resolveCurrentUserMock.mockResolvedValue({
    id: 'user-1',
    name: 'Pantry Test',
  })

  const res = await app.request('/api/v1/profiles/user-2', {}, envWith(DB))
  expect(res.status).toBe(404)
  const text = await res.text()
  expect(text).not.toMatch(/<!doctype html>/i)
})
