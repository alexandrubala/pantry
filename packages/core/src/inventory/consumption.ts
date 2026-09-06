import { DomainError } from '../errors.js'
import { validateQuantity } from './quantity.js'

export type ConsumableLot = {
  id: string
  locationId: string
  quantity: number
  expiresOn: string | null
  createdAt: string
}

export type ConsumptionAllocation = {
  lotId: string
  locationId: string
  quantity: number
  expiresOn: string | null
  remainingQuantity: number
}

export type ConsumptionPlanResult =
  | { ok: true; allocations: ConsumptionAllocation[]; requested: number }
  | { ok: false; code: 'INSUFFICIENT_STOCK'; available: number; requested: number }

function compareFefoLots(left: ConsumableLot, right: ConsumableLot): number {
  if (left.expiresOn && !right.expiresOn) {
    return -1
  }

  if (!left.expiresOn && right.expiresOn) {
    return 1
  }

  if (left.expiresOn && right.expiresOn && left.expiresOn !== right.expiresOn) {
    return left.expiresOn < right.expiresOn ? -1 : 1
  }

  if (left.createdAt !== right.createdAt) {
    return left.createdAt < right.createdAt ? -1 : 1
  }

  if (left.id !== right.id) {
    return left.id < right.id ? -1 : 1
  }

  return 0
}

export function totalAvailableQuantity(lots: readonly ConsumableLot[]): number {
  return lots.reduce((sum, lot) => sum + lot.quantity, 0)
}

export function buildConsumptionPlan(
  requested: number,
  lots: readonly ConsumableLot[],
): ConsumptionPlanResult {
  validateQuantity(requested)

  const available = totalAvailableQuantity(lots)
  if (available < requested) {
    return {
      ok: false,
      code: 'INSUFFICIENT_STOCK',
      available,
      requested,
    }
  }

  const ordered = lots.slice().sort(compareFefoLots)
  const allocations: ConsumptionAllocation[] = []
  let remaining = requested

  for (const lot of ordered) {
    if (remaining <= 0) {
      break
    }

    const take = Math.min(lot.quantity, remaining)
    if (take <= 0) {
      continue
    }

    allocations.push({
      lotId: lot.id,
      locationId: lot.locationId,
      quantity: take,
      expiresOn: lot.expiresOn,
      remainingQuantity: lot.quantity - take,
    })
    remaining -= take
  }

  if (remaining > 1e-9) {
    throw new DomainError('INSUFFICIENT_STOCK', 'INSUFFICIENT_STOCK', { available })
  }

  return { ok: true, allocations, requested }
}
