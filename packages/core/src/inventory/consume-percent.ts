import { DomainError } from '../errors.js'
import type { Unit } from '../product/units.js'
import { validateQuantity } from './quantity.js'

export const CONSUME_PERCENTS = [25, 50, 75, 100] as const
export type ConsumePercent = (typeof CONSUME_PERCENTS)[number]

export function isDiscreteUnit(unit: Unit): boolean {
  return unit === 'each' || unit === 'package'
}

/** Round halves toward the even integer (banker's rounding). 2.5 → 2, 7.5 → 8. */
export function roundHalfToEven(value: number): number {
  if (!Number.isFinite(value)) {
    throw new DomainError('INVALID_QUANTITY', 'Invalid quantity')
  }

  const floor = Math.floor(value)
  const fraction = value - floor
  if (fraction > 0.5) {
    return floor + 1
  }
  if (fraction < 0.5) {
    return floor
  }

  return floor % 2 === 0 ? floor : floor + 1
}

function roundToDecimals(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/**
 * Percentage of currently displayed household stock.
 * Discrete units never yield fractions. Result is never 0 when stock > 0.
 */
export function consumePercentQuantity(stock: number, percent: ConsumePercent, unit: Unit): number {
  validateQuantity(stock)

  if (percent === 100) {
    return stock
  }

  const raw = (stock * percent) / 100

  if (isDiscreteUnit(unit)) {
    let quantity = roundHalfToEven(raw)
    if (quantity < 1) {
      quantity = 1
    }
    const maxWhole = Math.max(1, Math.floor(stock))
    return Math.min(quantity, maxWhole)
  }

  const rounded = roundToDecimals(raw, 3)
  if (rounded <= 0) {
    return Math.min(stock, 0.001)
  }

  return Math.min(rounded, stock)
}
