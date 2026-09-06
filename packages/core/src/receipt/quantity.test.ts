import { expect, test } from 'vitest'
import { suggestReceiptImportQuantity } from './quantity.js'
import type { ReceiptDraftItem, ReceiptProductMatch } from './types.js'

const packageLine: ReceiptDraftItem = {
  rawName: 'LAPTE',
  name: 'Lapte',
  quantity: 1,
  unit: 'package',
  lineTotal: 7.99,
  weightValue: null,
  weightUnit: null,
  confidence: 0.9,
}

const weightedLine: ReceiptDraftItem = {
  rawName: 'BANANE',
  name: 'Banane',
  quantity: 1,
  unit: null,
  lineTotal: 5.2,
  weightValue: 0.742,
  weightUnit: 'kg',
  confidence: 0.85,
}

test('unknown package net quantity stays 1 package for a new product', () => {
  expect(suggestReceiptImportQuantity({ item: packageLine, product: null })).toEqual({
    quantity: 1,
    unit: 'package',
  })
})

test('known package metadata may suggest millilitres on a matched product', () => {
  const milk: ReceiptProductMatch = {
    id: 'p1',
    name: 'Lapte Pilos',
    brand: 'Pilos',
    unit: 'ml',
    packageQuantity: 1000,
    packageUnit: 'ml',
  }
  expect(suggestReceiptImportQuantity({ item: packageLine, product: milk })).toEqual({
    quantity: 1000,
    unit: 'ml',
  })
})

test('weighted kilograms convert to grams when the product uses g', () => {
  const bananas: ReceiptProductMatch = {
    id: 'p2',
    name: 'Banane',
    brand: null,
    unit: 'g',
    packageQuantity: null,
    packageUnit: null,
  }
  expect(suggestReceiptImportQuantity({ item: weightedLine, product: bananas })).toEqual({
    quantity: 742,
    unit: 'g',
  })
})

test('does not convert grams to millilitres', () => {
  const milk: ReceiptProductMatch = {
    id: 'p1',
    name: 'Lapte',
    brand: null,
    unit: 'ml',
    packageQuantity: null,
    packageUnit: null,
  }
  expect(suggestReceiptImportQuantity({ item: weightedLine, product: milk })).toEqual({
    quantity: 1,
    unit: 'ml',
  })
})

test('does not infer quantity from line price', () => {
  const expensive: ReceiptDraftItem = { ...packageLine, lineTotal: 19.99, quantity: 1 }
  expect(suggestReceiptImportQuantity({ item: expensive, product: null }).quantity).toBe(1)
})
