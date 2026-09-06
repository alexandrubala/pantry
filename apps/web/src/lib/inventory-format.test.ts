import { expect, test } from 'vitest'
import {
  attentionCards,
  formatExpiryBadge,
  formatExpiryHeadline,
  formatHistoryHeadline,
  formatLotExpiry,
  formatQuantity,
  formatKcal100g,
  formatMacroLine,
  isExpirySoon,
  itemMatchesStatusFilter,
  quickAddLot,
  unitLabel,
} from './inventory-format'
import type { InventoryItem } from '@pantry/core'

test('formats Romanian quantities and unit labels', () => {
  expect(formatQuantity(2000, 'ml')).toBe('2.000 ml')
  expect(formatQuantity(10, 'each')).toBe('10 buc')
  expect(formatQuantity(1, 'package')).toBe('1 pachet')
  expect(formatQuantity(2, 'package')).toBe('2 pachete')
  expect(unitLabel('g')).toBe('g')
})

test('formats expiry copy without shifting the calendar date', () => {
  expect(formatExpiryHeadline('2026-09-12', '2026-09-01')).toBe('12 sept.')
  expect(formatLotExpiry(null)).toBe('fără expirare')
})

test('uses semantic expiry labels for the 7-day window', () => {
  expect(formatExpiryBadge('2026-09-05', '2026-09-06')).toEqual({
    status: 'expired',
    label: 'Expirat',
    tone: 'danger',
  })
  expect(formatExpiryBadge('2026-09-06', '2026-09-06')?.label).toBe('Expiră azi')
  expect(formatExpiryBadge('2026-09-07', '2026-09-06')?.label).toBe('Expiră mâine')
  expect(formatExpiryBadge('2026-09-10', '2026-09-06')?.label).toBe('Expiră în 4 zile')
  expect(isExpirySoon('2026-09-13', '2026-09-06')).toBe(true)
  expect(isExpirySoon('2026-09-14', '2026-09-06')).toBe(false)
})

test('formats source nutrition without inventing values', () => {
  expect(formatKcal100g(539)).toBe('539 kcal / 100 g')
  expect(
    formatMacroLine({
      energyKcal100g: 539,
      proteinG100g: 6.3,
      carbohydratesG100g: 57.5,
      fatG100g: 30.9,
      sugarsG100g: null,
      fiberG100g: null,
      saltG100g: null,
      servingSize: null,
      energyKcalServing: null,
      proteinGServing: null,
      carbohydratesGServing: null,
      fatGServing: null,
    }),
  ).toBe('P 6,3 g · C 57,5 g · G 30,9 g')
})

function item(overrides: Partial<InventoryItem> & Pick<InventoryItem, 'product'>): InventoryItem {
  return {
    totalQuantity: 0,
    nearestExpiry: null,
    lots: [],
    minimumQuantity: 0,
    lowStock: false,
    ...overrides,
  }
}

test('quick add only targets a single no-expiry lot in the chosen location', () => {
  const product = {
    id: 'p1',
    name: 'Ouă',
    brand: null,
    unit: 'each' as const,
    barcode: null,
    imageUrl: null,
    source: 'manual' as const,
    householdOwned: true,
    externalCatalog: null,
    packageQuantity: null,
    packageUnit: null,
    nutrition: null,
  }
  const noExpiry = {
    id: 'lot-1',
    locationId: 'fridge',
    locationName: 'Frigider',
    quantity: 6,
    expiresOn: null,
  }
  expect(quickAddLot(item({ product, lots: [noExpiry] }), 'fridge')?.id).toBe('lot-1')
  expect(
    quickAddLot(
      item({
        product,
        lots: [noExpiry, { ...noExpiry, id: 'lot-2', expiresOn: '2026-09-12' }],
      }),
      'fridge',
    )?.id,
  ).toBe('lot-1')
  expect(quickAddLot(item({ product, lots: [{ ...noExpiry, expiresOn: '2026-09-12' }] }), 'fridge')).toBeNull()
})

test('attention prioritizes expired, then soon, then low stock', () => {
  const baseProduct = {
    brand: null,
    barcode: null,
    imageUrl: null,
    source: 'manual' as const,
    householdOwned: true,
    externalCatalog: null,
    packageQuantity: null,
    packageUnit: null,
    nutrition: null,
  }
  const cards = attentionCards(
    [
      item({
        product: { ...baseProduct, id: 'low', name: 'Ouă', unit: 'each' },
        totalQuantity: 2,
        minimumQuantity: 6,
        lowStock: true,
      }),
      item({
        product: { ...baseProduct, id: 'soon', name: 'Iaurt', unit: 'each' },
        lots: [
          {
            id: 's',
            locationId: 'f',
            locationName: 'Frigider',
            quantity: 1,
            expiresOn: '2026-09-08',
          },
        ],
      }),
      item({
        product: { ...baseProduct, id: 'old', name: 'Piept de pui', unit: 'g' },
        lots: [
          {
            id: 'e',
            locationId: 'f',
            locationName: 'Congelator',
            quantity: 400,
            expiresOn: '2026-09-05',
          },
        ],
      }),
    ],
    '2026-09-06',
  )

  expect(cards.map((card) => card.reason)).toEqual(['expired', 'soon', 'low'])
})

test('status filters match low stock and expiry lots', () => {
  const product = {
    id: 'p1',
    name: 'Lapte',
    brand: null,
    unit: 'ml' as const,
    barcode: null,
    imageUrl: null,
    source: 'manual' as const,
    householdOwned: true,
    externalCatalog: null,
    packageQuantity: null,
    packageUnit: null,
    nutrition: null,
  }
  const low = item({ product, totalQuantity: 400, minimumQuantity: 1000, lowStock: true })
  expect(itemMatchesStatusFilter(low, 'low')).toBe(true)
  expect(itemMatchesStatusFilter(low, 'expired')).toBe(false)
  expect(
    formatHistoryHeadline({
      id: 'h',
      productId: 'p1',
      productName: 'Lapte',
      locationId: 'f',
      locationName: 'Frigider',
      userId: 'u',
      action: 'adjust',
      deltaQuantity: -50,
      unit: 'ml',
      expiresOn: null,
      createdAt: '2026-09-06T18:42:00.000Z',
    }),
  ).toBe('Corectat · −50 ml Lapte')
})
