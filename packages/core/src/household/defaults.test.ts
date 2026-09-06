import { expect, test } from 'vitest'
import { DEFAULT_LOCATIONS, nextLocationSortOrder } from './defaults.js'
import { planHouseholdCreation, selectFallbackHouseholdId, assertHouseholdOwner } from './plan.js'

test('defines seven Romanian default locations with stable sort order', () => {
  expect(DEFAULT_LOCATIONS).toHaveLength(7)
  expect(DEFAULT_LOCATIONS.map((location) => location.name)).toEqual([
    'Frigider',
    'Congelator',
    'Cămară',
    'Baie',
    'Garaj',
    'Curățenie',
    'Altele',
  ])
  expect(DEFAULT_LOCATIONS.map((location) => location.sortOrder)).toEqual([10, 20, 30, 40, 50, 60, 70])
  expect(DEFAULT_LOCATIONS.map((location) => location.normalizedName)).toEqual([
    'frigider',
    'congelator',
    'cămară',
    'baie',
    'garaj',
    'curățenie',
    'altele',
  ])
})

test('nextLocationSortOrder appends in steps of 10', () => {
  expect(nextLocationSortOrder(null)).toBe(10)
  expect(nextLocationSortOrder(70)).toBe(80)
})

test('planHouseholdCreation assigns owner membership, defaults, and active household', () => {
  const locationIds = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7']
  const plan = planHouseholdCreation({
    householdId: 'h1',
    userId: 'u1',
    name: '  Casa mea  ',
    locationIds,
    now: '2026-09-06T09:00:00.000Z',
  })

  expect(plan.household).toEqual({
    id: 'h1',
    name: 'Casa mea',
    createdAt: '2026-09-06T09:00:00.000Z',
    updatedAt: '2026-09-06T09:00:00.000Z',
  })
  expect(plan.membership).toEqual({
    householdId: 'h1',
    userId: 'u1',
    role: 'owner',
    createdAt: '2026-09-06T09:00:00.000Z',
  })
  expect(plan.locations).toHaveLength(7)
  expect(plan.locations[0]).toEqual({
    id: 'l1',
    name: 'Frigider',
    normalizedName: 'frigider',
    sortOrder: 10,
  })
  expect(plan.activeHouseholdId).toBe('h1')
})

test('selectFallbackHouseholdId keeps a valid active household and otherwise picks another membership', () => {
  const memberships = [{ householdId: 'h1' }, { householdId: 'h2' }]
  expect(selectFallbackHouseholdId(memberships, 'h2')).toBe('h2')
  expect(selectFallbackHouseholdId(memberships, 'missing')).toBe('h1')
  expect(selectFallbackHouseholdId([], 'h1')).toBeNull()
})

test('assertHouseholdOwner forbids members and hides missing memberships', () => {
  const owner = { householdId: 'h1', name: 'Casa', role: 'owner' as const }
  const member = { householdId: 'h1', name: 'Casa', role: 'member' as const }
  expect(assertHouseholdOwner(owner)).toBeUndefined()
  expect(() => assertHouseholdOwner(member)).toThrowError(/Forbidden/)
  expect(() => assertHouseholdOwner(null)).toThrowError(/Not found/)
})
