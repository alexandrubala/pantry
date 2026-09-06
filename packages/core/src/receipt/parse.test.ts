import { expect, test } from 'vitest'
import { DomainError } from '../errors.js'
import { parseReceiptDraft } from './parse.js'

const validItem = {
  rawName: 'LAPTE PILOS 3.5%',
  name: 'Lapte Pilos 3.5%',
  quantity: 1,
  unit: 'package',
  lineTotal: 7.99,
  weightValue: null,
  weightUnit: null,
  confidence: 0.91,
}

test('parses a Romanian receipt draft', () => {
  const draft = parseReceiptDraft({
    merchant: 'Lidl',
    date: '2026-09-06',
    currency: 'RON',
    total: 152.4,
    items: [validItem],
  })
  expect(draft.merchant).toBe('Lidl')
  expect(draft.date).toBe('2026-09-06')
  expect(draft.items).toHaveLength(1)
  expect(draft.items[0]?.name).toBe('Lapte Pilos 3.5%')
})

test('keeps missing totals and optional fields as null', () => {
  const draft = parseReceiptDraft({
    merchant: null,
    date: 'not-a-date',
    currency: 12,
    total: null,
    items: [{ ...validItem, lineTotal: null, confidence: null }],
  })
  expect(draft.merchant).toBeNull()
  expect(draft.date).toBeNull()
  expect(draft.currency).toBeNull()
  expect(draft.total).toBeNull()
  expect(draft.items[0]?.lineTotal).toBeNull()
})

test('accepts a weighted line and a package line together', () => {
  const draft = parseReceiptDraft({
    merchant: 'Kaufland',
    date: '2026-09-06',
    currency: 'RON',
    total: 40,
    items: [
      {
        rawName: 'BANANE',
        name: 'Banane',
        quantity: 1,
        unit: null,
        lineTotal: 5.2,
        weightValue: 0.742,
        weightUnit: 'kg',
        confidence: 0.8,
      },
      validItem,
    ],
  })
  expect(draft.items[0]?.weightValue).toBe(0.742)
  expect(draft.items[0]?.weightUnit).toBe('kg')
  expect(draft.items[1]?.unit).toBe('package')
})

test('keeps duplicate-looking lines instead of merging them', () => {
  const draft = parseReceiptDraft({
    merchant: 'Lidl',
    date: '2026-09-06',
    currency: 'RON',
    total: 16,
    items: [validItem, { ...validItem, lineTotal: 8.49 }],
  })
  expect(draft.items).toHaveLength(2)
  expect(draft.items.map((item) => item.lineTotal)).toEqual([7.99, 8.49])
})

test('drops items without a readable name and rejects invented units', () => {
  const draft = parseReceiptDraft({
    merchant: 'Lidl',
    date: '2026-09-06',
    currency: 'RON',
    total: 10,
    items: [
      { ...validItem, unit: 'boxes' },
      { rawName: '   ', name: '', quantity: 1, unit: 'package', lineTotal: 1, weightValue: null, weightUnit: null, confidence: 0.2 },
      validItem,
    ],
  })
  expect(draft.items).toHaveLength(2)
  expect(draft.items[0]?.unit).toBeNull()
})

test('does not accept hallucinated extra fields as draft data', () => {
  const draft = parseReceiptDraft({
    merchant: 'Lidl',
    date: '2026-09-06',
    currency: 'RON',
    total: 7.99,
    pantryProductId: 'invented',
    location: 'Frigider',
    items: [{ ...validItem, calories: 999, quantity: -2 }],
  })
  expect(draft.items[0]?.quantity).toBeNull()
  expect(JSON.stringify(draft)).not.toMatch(/invented|calories|Frigider/)
})

test('rejects invalid model output', () => {
  expect(() => parseReceiptDraft(null)).toThrow(DomainError)
  expect(() => parseReceiptDraft('lapte')).toThrow(DomainError)
  try {
    parseReceiptDraft({ merchant: 'Lidl', items: [] })
    throw new Error('expected no items to fail')
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError)
    expect((error as DomainError).code).toBe('RECEIPT_NO_ITEMS')
  }
})

test('low confidence is kept but not used as a required field', () => {
  const draft = parseReceiptDraft({
    merchant: 'Lidl',
    date: '2026-09-06',
    currency: 'RON',
    total: 7.99,
    items: [{ ...validItem, confidence: 0.12 }],
  })
  expect(draft.items[0]?.confidence).toBe(0.12)
})
