import type { ConsumptionAllocation, Unit } from '@pantry/core'
import type { D1DatabaseLike, D1PreparedStatementLike } from './d1-like.js'

export function isConflictGuardError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  return /inventory_conflict_abort|CHECK constraint failed/i.test(error.message)
}

export function isUniqueConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  return /UNIQUE constraint failed/i.test(error.message)
}

export function staleLotAbortStatement(
  db: D1DatabaseLike,
  input: {
    lotId: string
    householdId: string
    expectedQuantity: number
    locationId?: string
    expiresKey?: string
  },
): D1PreparedStatementLike {
  if (input.locationId != null && input.expiresKey != null) {
    return db
      .prepare(
        `INSERT INTO inventory_conflict_abort (reason)
         SELECT 'STALE_LOT'
         WHERE NOT EXISTS (
           SELECT 1
           FROM inventory_lots
           WHERE id = ?1
             AND household_id = ?2
             AND quantity = ?3
             AND location_id = ?4
             AND expires_key = ?5
         )`,
      )
      .bind(
        input.lotId,
        input.householdId,
        input.expectedQuantity,
        input.locationId,
        input.expiresKey,
      )
  }

  if (input.locationId) {
    return db
      .prepare(
        `INSERT INTO inventory_conflict_abort (reason)
         SELECT 'STALE_LOT'
         WHERE NOT EXISTS (
           SELECT 1
           FROM inventory_lots
           WHERE id = ?1
             AND household_id = ?2
             AND quantity = ?3
             AND location_id = ?4
         )`,
      )
      .bind(input.lotId, input.householdId, input.expectedQuantity, input.locationId)
  }

  return db
    .prepare(
      `INSERT INTO inventory_conflict_abort (reason)
       SELECT 'STALE_LOT'
       WHERE NOT EXISTS (
         SELECT 1
         FROM inventory_lots
         WHERE id = ?1
           AND household_id = ?2
           AND quantity = ?3
       )`,
    )
    .bind(input.lotId, input.householdId, input.expectedQuantity)
}

export function lotConsumptionStatements(
  db: D1DatabaseLike,
  input: {
    householdId: string
    userId: string
    productId: string
    unit: Unit
    allocations: readonly ConsumptionAllocation[]
    now: string
  },
): D1PreparedStatementLike[] {
  return [
    ...input.allocations.map((allocation) => {
      const expectedQuantity = allocation.quantity + allocation.remainingQuantity
      return db
        .prepare(
          `INSERT INTO inventory_conflict_abort (reason)
           SELECT 'STALE_LOT'
           WHERE NOT EXISTS (
             SELECT 1
             FROM inventory_lots
             WHERE id = ?1
               AND household_id = ?2
               AND product_id = ?3
               AND quantity = ?4
           )`,
        )
        .bind(allocation.lotId, input.householdId, input.productId, expectedQuantity)
    }),
    ...input.allocations.map((allocation) => {
      if (allocation.remainingQuantity <= 1e-9) {
        return db
          .prepare(
            `DELETE FROM inventory_lots
             WHERE id = ?1 AND household_id = ?2 AND product_id = ?3`,
          )
          .bind(allocation.lotId, input.householdId, input.productId)
      }

      return db
        .prepare(
          `UPDATE inventory_lots
           SET quantity = ?1, updated_at = ?2
           WHERE id = ?3 AND household_id = ?4 AND product_id = ?5`,
        )
        .bind(
          allocation.remainingQuantity,
          input.now,
          allocation.lotId,
          input.householdId,
          input.productId,
        )
    }),
    ...input.allocations.map((allocation) =>
      db
        .prepare(
          `INSERT INTO inventory_history (
             id, household_id, product_id, location_id, user_id, action, delta_quantity, unit, expires_on, created_at
           ) VALUES (?1, ?2, ?3, ?4, ?5, 'consume', ?6, ?7, ?8, ?9)`,
        )
        .bind(
          crypto.randomUUID(),
          input.householdId,
          input.productId,
          allocation.locationId,
          input.userId,
          -allocation.quantity,
          input.unit,
          allocation.expiresOn,
          input.now,
        ),
    ),
  ]
}
