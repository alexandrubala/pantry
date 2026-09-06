import type { Unit } from './units.js'

export type PackageQuantityInference = {
  quantity: number | null
  unit: Unit | null
  confident: boolean
}

const UNIT_ALIASES: Record<string, { unit: Unit; multiplier: number }> = {
  g: { unit: 'g', multiplier: 1 },
  kg: { unit: 'g', multiplier: 1000 },
  ml: { unit: 'ml', multiplier: 1 },
  l: { unit: 'ml', multiplier: 1000 },
}

function parseNumber(raw: string): number | null {
  const normalized = raw.replace(',', '.')
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    return null
  }

  const value = Number(normalized)
  if (!Number.isFinite(value) || value <= 0) {
    return null
  }

  return value
}

function fromUnitToken(amount: number, token: string): PackageQuantityInference | null {
  const mapped = UNIT_ALIASES[token.toLowerCase()]
  if (!mapped) {
    return null
  }

  return {
    quantity: amount * mapped.multiplier,
    unit: mapped.unit,
    confident: true,
  }
}

export function inferPackageQuantity(input: {
  quantityText?: string | null
  productQuantity?: number | null
  productQuantityUnit?: string | null
}): PackageQuantityInference {
  const ambiguous: PackageQuantityInference = { quantity: null, unit: null, confident: false }
  const text = input.quantityText?.trim() ?? ''

  if (text && /[x×]/i.test(text)) {
    return ambiguous
  }

  const textMatch = text.match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml)$/i)
  const fromText = textMatch
    ? (() => {
        const amount = parseNumber(textMatch[1] ?? '')
        const unitToken = textMatch[2]
        if (amount == null || !unitToken) {
          return null
        }
        return fromUnitToken(amount, unitToken)
      })()
    : null

  const quantityUnit = input.productQuantityUnit?.trim() ?? ''
  const fromNumeric =
    typeof input.productQuantity === 'number' &&
    Number.isFinite(input.productQuantity) &&
    input.productQuantity > 0 &&
    quantityUnit
      ? fromUnitToken(input.productQuantity, quantityUnit)
      : null

  if (fromText && fromNumeric) {
    if (fromText.unit !== fromNumeric.unit || fromText.quantity !== fromNumeric.quantity) {
      return ambiguous
    }
    return fromText
  }

  if (fromText) {
    return fromText
  }

  if (fromNumeric) {
    return fromNumeric
  }

  return ambiguous
}

export function defaultUnitFromPackage(inference: PackageQuantityInference, fallback: Unit = 'package'): Unit {
  if (inference.confident && (inference.unit === 'g' || inference.unit === 'ml')) {
    return inference.unit
  }

  return fallback
}
