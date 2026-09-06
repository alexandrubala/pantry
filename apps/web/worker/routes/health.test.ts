import { expect, test } from 'vitest'
import { app } from '../index'
import { APP_VERSION } from './health'

function envWithDb(first: () => Promise<unknown>, onPrepare?: (query: string) => void) {
  return {
    DB: {
      prepare(query: string) {
        onPrepare?.(query)
        return { first }
      },
    },
  }
}

test('GET /api/v1/health returns 200 when the database responds', async () => {
  let query = ''
  const res = await app.request(
    '/api/v1/health',
    {},
    envWithDb(
      async () => ({ '1': 1 }),
      (sql) => {
        query = sql
      },
    ),
  )

  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toMatch(/application\/json/)
  await expect(res.json()).resolves.toEqual({
    ok: true,
    service: 'pantry',
    version: APP_VERSION,
    database: 'ok',
  })
  expect(query).toBe('SELECT 1')
})

test('GET /api/v1/health returns 503 when the database fails', async () => {
  const res = await app.request(
    '/api/v1/health',
    {},
    envWithDb(async () => {
      throw new Error('D1_ERROR: internal sqlite failure at db d95a8fcf-545c-46c1-82df-998f96dd8cc7')
    }),
  )

  expect(res.status).toBe(503)
  const body = await res.json()
  expect(body).toEqual({
    ok: false,
    service: 'pantry',
    version: APP_VERSION,
    database: 'unavailable',
  })
  expect(JSON.stringify(body)).not.toMatch(/D1_ERROR|sqlite|d95a8fcf/i)
})

test('GET /api/dev/ping is not a Worker route', async () => {
  const res = await app.request('/api/dev/ping')
  expect(res.status).toBe(404)
})

test('GET /api/v1/not-found is a Worker 404', async () => {
  const res = await app.request('/api/v1/not-found')
  expect(res.status).toBe(404)
  const text = await res.text()
  expect(text).not.toMatch(/<!doctype html>/i)
})
