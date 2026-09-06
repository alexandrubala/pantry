import { expect, test } from 'vitest'
import { matchReceiptProduct } from './match.js'
import type { ReceiptProductMatch } from './types.js'

const pilos: ReceiptProductMatch = {
  id: 'p1',
  name: 'Lapte Pilos',
  brand: 'Pilos',
  unit: 'ml',
  packageQuantity: 1000,
  packageUnit: 'ml',
}

const generic: ReceiptProductMatch = {
  id: 'p2',
  name: 'Lapte',
  brand: null,
  unit: 'ml',
  packageQuantity: null,
  packageUnit: null,
}

test('binds a unique exact name match', () => {
  expect(matchReceiptProduct('Lapte Pilos', [pilos, generic])?.id).toBe('p1')
  expect(matchReceiptProduct('PILOS LAPTE PILOS', [pilos])?.id).toBe('p1')
})

test('does not auto-bind a weak partial name', () => {
  expect(matchReceiptProduct('LAPTE', [pilos])).toBeNull()
  expect(matchReceiptProduct('Lapte Pilos 3.5%', [pilos])).toBeNull()
})

test('binds an exact unique name among mixed products', () => {
  expect(matchReceiptProduct('LAPTE', [pilos, generic])?.id).toBe('p2')
})

test('does not auto-bind when two products share the same normalized name', () => {
  const duplicate: ReceiptProductMatch = { ...pilos, id: 'p3', brand: 'Altul' }
  expect(matchReceiptProduct('Lapte Pilos', [pilos, duplicate])).toBeNull()
})
