import { aiRateLimitRetryAfterSeconds, aiRateLimitWindowStart } from '../recipe/rate-limit.js'

export const RECEIPT_EXTRACTION_LIMIT_PER_HOUR = 15


export function receiptRateLimitWindowStart(now: Date): string {
  return aiRateLimitWindowStart(now)
}

export function receiptRateLimitRetryAfterSeconds(now: Date): number {
  return aiRateLimitRetryAfterSeconds(now)
}

export function receiptExtractionLimitPerHour(): number {
  return RECEIPT_EXTRACTION_LIMIT_PER_HOUR
}
