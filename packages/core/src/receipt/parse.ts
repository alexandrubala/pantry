import { DomainError } from '../errors.js'
import { isUnit, type Unit } from '../product/units.js'
import {
  RECEIPT_MAX_ITEMS,
  RECEIPT_WEIGHT_UNITS,
  type ReceiptDraft,
  type ReceiptDraftItem,
  type ReceiptWeightUnit,
} from './types.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function optionalTrimmedString(value: unknown, maxLength: number): string | null {
  if (value == null) {
    return null
  }
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim().replace(/\s+/g, ' ')
  if (!trimmed || trimmed.length > maxLength) {
    return null
  }
  return trimmed
}

function optionalFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }
  return value
}

function optionalPositiveNumber(value: unknown): number | null {
  const number = optionalFiniteNumber(value)
  if (number == null || number <= 0) {
    return null
  }
  return number
}

function optionalUnit(value: unknown): Unit | null {
  if (typeof value !== 'string' || !isUnit(value)) {
    return null
  }
  return value
}

function optionalWeightUnit(value: unknown): ReceiptWeightUnit | null {
  if (typeof value !== 'string') {
    return null
  }
  return (RECEIPT_WEIGHT_UNITS as readonly string[]).includes(value)
    ? (value as ReceiptWeightUnit)
    : null
}

function optionalConfidence(value: unknown): number | null {
  const number = optionalFiniteNumber(value)
  if (number == null || number < 0 || number > 1) {
    return null
  }
  return number
}

function optionalIsoDate(value: unknown): string | null {
  const text = optionalTrimmedString(value, 16)
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return null
  }
  return text
}

function parseItem(value: unknown): ReceiptDraftItem | null {
  if (!isRecord(value)) {
    return null
  }

  const rawName = optionalTrimmedString(value.rawName, 160)
  const name = optionalTrimmedString(value.name, 120) ?? rawName
  if (!name) {
    return null
  }

  return {
    rawName: rawName ?? name,
    name,
    quantity: optionalPositiveNumber(value.quantity),
    unit: optionalUnit(value.unit),
    lineTotal: optionalPositiveNumber(value.lineTotal),
    weightValue: optionalPositiveNumber(value.weightValue),
    weightUnit: optionalWeightUnit(value.weightUnit),
    confidence: optionalConfidence(value.confidence),
  }
}

export function parseReceiptDraft(value: unknown): ReceiptDraft {
  if (!isRecord(value)) {
    throw new DomainError('RECEIPT_EXTRACTION_FAILED', 'RECEIPT_EXTRACTION_FAILED')
  }

  const itemsRaw = Array.isArray(value.items) ? value.items : []
  const items = itemsRaw
    .slice(0, RECEIPT_MAX_ITEMS)
    .map(parseItem)
    .filter((item): item is ReceiptDraftItem => item != null)

  if (items.length === 0) {
    throw new DomainError('RECEIPT_NO_ITEMS', 'RECEIPT_NO_ITEMS')
  }

  return {
    merchant: optionalTrimmedString(value.merchant, 80),
    date: optionalIsoDate(value.date),
    currency: optionalTrimmedString(value.currency, 8),
    total: optionalPositiveNumber(value.total),
    items,
  }
}
