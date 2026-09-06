import { AI_GENERATION_LIMIT_PER_HOUR } from './types.js'

export function aiRateLimitWindowStart(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), 0, 0, 0),
  ).toISOString()
}

export function aiRateLimitRetryAfterSeconds(now: Date): number {
  const windowStart = new Date(aiRateLimitWindowStart(now))
  const nextWindow = new Date(windowStart.getTime() + 60 * 60 * 1000)
  return Math.max(1, Math.ceil((nextWindow.getTime() - now.getTime()) / 1000))
}

export function aiGenerationLimitPerHour(): number {
  return AI_GENERATION_LIMIT_PER_HOUR
}
