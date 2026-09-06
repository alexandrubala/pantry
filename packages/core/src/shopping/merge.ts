import { DomainError } from '../errors.js'
import type { Unit } from '../product/units.js'

export type ShoppingQuantity = {
  quantity: number | null
  unit: Unit | null
}

export function shoppingUnitsCompatible(existing: Unit | null, incoming: Unit | null): boolean {
  return existing === incoming
}

export function mergeShoppingQuantities(
  existing: ShoppingQuantity,
  incoming: ShoppingQuantity,
): ShoppingQuantity {
  if (!shoppingUnitsCompatible(existing.unit, incoming.unit)) {
    throw new DomainError('SHOPPING_UNIT_CONFLICT', 'Shopping item units do not match')
  }

  if (existing.quantity == null) {
    return { quantity: incoming.quantity, unit: existing.unit }
  }

  if (incoming.quantity == null) {
    return { quantity: existing.quantity, unit: existing.unit }
  }

  return { quantity: existing.quantity + incoming.quantity, unit: existing.unit }
}
