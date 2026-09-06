import { expect, test } from 'vitest'
import { buildConsumptionPlan, type ConsumableLot } from './consumption.js'

function lot(overrides: Partial<ConsumableLot> & Pick<ConsumableLot, 'id' | 'quantity'>): ConsumableLot {
  return {
    locationId: 'loc-1',
    expiresOn: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }
}

test('consumes from a single lot', () => {
  const lots = [lot({ id: 'a', quantity: 1000, expiresOn: '2026-09-10' })]
  const plan = buildConsumptionPlan(250, lots)

  expect(plan).toEqual({
    ok: true,
    requested: 250,
    allocations: [
      {
        lotId: 'a',
        locationId: 'loc-1',
        quantity: 250,
        expiresOn: '2026-09-10',
        remainingQuantity: 750,
      },
    ],
  })
  expect(lots[0]?.quantity).toBe(1000)
})

test('consumes earliest expiry first across multiple lots', () => {
  const lots = [
    lot({ id: 'late', quantity: 700, expiresOn: '2026-09-10', createdAt: '2026-09-01T00:00:00.000Z' }),
    lot({ id: 'early', quantity: 500, expiresOn: '2026-09-08', createdAt: '2026-09-02T00:00:00.000Z' }),
  ]
  const plan = buildConsumptionPlan(600, lots)

  expect(plan.ok).toBe(true)
  if (!plan.ok) {
    return
  }

  expect(plan.allocations.map((item) => item.lotId)).toEqual(['early', 'late'])
  expect(plan.allocations.map((item) => item.quantity)).toEqual([500, 100])
})

test('uses expiry lots before no-expiry lots', () => {
  const lots = [
    lot({ id: 'none', quantity: 1000, expiresOn: null }),
    lot({ id: 'exp', quantity: 400, expiresOn: '2026-09-09' }),
  ]
  const plan = buildConsumptionPlan(400, lots)

  expect(plan.ok).toBe(true)
  if (!plan.ok) {
    return
  }

  expect(plan.allocations).toEqual([
    {
      lotId: 'exp',
      locationId: 'loc-1',
      quantity: 400,
      expiresOn: '2026-09-09',
      remainingQuantity: 0,
    },
  ])
})

test('milk example consumes 900 ml from the two earliest expiry lots', () => {
  const lots = [
    lot({ id: 'second', quantity: 700, expiresOn: '2026-09-10' }),
    lot({ id: 'none', quantity: 1000, expiresOn: null }),
    lot({ id: 'first', quantity: 500, expiresOn: '2026-09-08' }),
  ]
  const plan = buildConsumptionPlan(900, lots)

  expect(plan.ok).toBe(true)
  if (!plan.ok) {
    return
  }

  expect(plan.allocations).toEqual([
    {
      lotId: 'first',
      locationId: 'loc-1',
      quantity: 500,
      expiresOn: '2026-09-08',
      remainingQuantity: 0,
    },
    {
      lotId: 'second',
      locationId: 'loc-1',
      quantity: 400,
      expiresOn: '2026-09-10',
      remainingQuantity: 300,
    },
  ])
})

test('exact quantity consumes the whole lot', () => {
  const plan = buildConsumptionPlan(10, [lot({ id: 'eggs', quantity: 10 })])
  expect(plan.ok).toBe(true)
  if (!plan.ok) {
    return
  }

  expect(plan.allocations[0]?.remainingQuantity).toBe(0)
  expect(plan.allocations[0]?.quantity).toBe(10)
})

test('partial lot leaves remaining quantity on the allocation', () => {
  const plan = buildConsumptionPlan(3, [lot({ id: 'eggs', quantity: 10 })])
  expect(plan.ok).toBe(true)
  if (!plan.ok) {
    return
  }

  expect(plan.allocations[0]?.remainingQuantity).toBe(7)
})

test('spans lots and locations', () => {
  const lots = [
    lot({ id: 'fridge', locationId: 'fridge', quantity: 200, expiresOn: '2026-09-07' }),
    lot({ id: 'pantry', locationId: 'pantry', quantity: 300, expiresOn: '2026-09-08' }),
  ]
  const plan = buildConsumptionPlan(450, lots)
  expect(plan.ok).toBe(true)
  if (!plan.ok) {
    return
  }

  expect(plan.allocations.map((item) => item.locationId)).toEqual(['fridge', 'pantry'])
  expect(plan.allocations.map((item) => item.quantity)).toEqual([200, 250])
})

test('returns insufficient stock without allocations', () => {
  const plan = buildConsumptionPlan(5, [lot({ id: 'a', quantity: 2 }), lot({ id: 'b', quantity: 2 })])
  expect(plan).toEqual({
    ok: false,
    code: 'INSUFFICIENT_STOCK',
    available: 4,
    requested: 5,
  })
})

test('orders same-expiry lots deterministically by createdAt then id', () => {
  const lots = [
    lot({ id: 'b', quantity: 1, expiresOn: '2026-09-10', createdAt: '2026-09-02T00:00:00.000Z' }),
    lot({ id: 'a', quantity: 1, expiresOn: '2026-09-10', createdAt: '2026-09-02T00:00:00.000Z' }),
    lot({ id: 'c', quantity: 1, expiresOn: '2026-09-10', createdAt: '2026-09-01T00:00:00.000Z' }),
  ]
  const plan = buildConsumptionPlan(3, lots)
  expect(plan.ok).toBe(true)
  if (!plan.ok) {
    return
  }

  expect(plan.allocations.map((item) => item.lotId)).toEqual(['c', 'a', 'b'])
})

test('does not mutate input lots', () => {
  const lots = [
    lot({ id: 'late', quantity: 700, expiresOn: '2026-09-10' }),
    lot({ id: 'early', quantity: 500, expiresOn: '2026-09-08' }),
  ]
  const snapshot = lots.map((item) => ({ ...item }))
  buildConsumptionPlan(600, lots)
  expect(lots).toEqual(snapshot)
})
