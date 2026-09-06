import {
  receiptExtractionLimitPerHour,
  receiptRateLimitRetryAfterSeconds,
  receiptRateLimitWindowStart,
  type ReceiptStore,
} from '@pantry/core'
import type { D1DatabaseLike } from './d1-like.js'

type RateLimitRow = {
  count: number
}

export function createD1ReceiptStore(db: D1DatabaseLike): ReceiptStore {
  return {
    async reserveReceiptExtraction(input) {
      const now = input.now ?? new Date()
      const windowStart = receiptRateLimitWindowStart(now)
      const limit = receiptExtractionLimitPerHour()
      const reserved = await db
        .prepare(
          `INSERT INTO receipt_ai_rate_limits (user_id, window_start, count)
           VALUES (?1, ?2, 1)
           ON CONFLICT (user_id, window_start) DO UPDATE SET
             count = receipt_ai_rate_limits.count + 1
           WHERE receipt_ai_rate_limits.count < ?3
           RETURNING count`,
        )
        .bind(input.userId, windowStart, limit)
        .all<RateLimitRow>()

      const count = reserved.results[0]?.count
      if (count == null) {
        return { ok: false, retryAfter: receiptRateLimitRetryAfterSeconds(now) }
      }

      return { ok: true, count }
    },
  }
}
