import { expect, test } from 'vitest'
import { aiRateLimitRetryAfterSeconds, aiRateLimitWindowStart } from './rate-limit.js'

test('uses a fixed UTC hour window', () => {
  const now = new Date('2026-09-06T14:37:12.000Z')
  expect(aiRateLimitWindowStart(now)).toBe('2026-09-06T14:00:00.000Z')
  expect(aiRateLimitRetryAfterSeconds(now)).toBe(22 * 60 + 48)
})
