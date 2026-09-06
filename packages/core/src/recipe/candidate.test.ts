import { expect, test } from 'vitest'
import { DomainError } from '../errors.js'
import {
  mergeCandidateIngredients,
  parseAiRecipeCandidate,
  validateCandidateAgainstInventory,
} from './candidate.js'
import type { InventoryProductContext } from './types.js'

const inventory: InventoryProductContext[] = [
  {
    productId: 'eggs',
    name: 'Ouă',
    brand: null,
    unit: 'each',
    availableQuantity: 10,
    packageQuantity: null,
    packageUnit: null,
    nutrition: null,
  },
  {
    productId: 'chicken',
    name: 'Piept de pui',
    brand: null,
    unit: 'g',
    availableQuantity: 500,
    packageQuantity: null,
    packageUnit: null,
    nutrition: { energyKcal100g: 110, proteinG100g: 23, carbohydratesG100g: 0, fatG100g: 2 },
  },
]

const valid = {
  title: 'Omletă cu pui',
  description: 'Rapidă',
  servings: 2,
  timeMinutes: 20,
  ingredients: [
    { productId: 'eggs', quantity: 4 },
    { productId: 'chicken', quantity: 150 },
  ],
  instructions: ['Bate ouăle', 'Gătește puiul'],
  notes: null,
}

test('parses a structured candidate and merges duplicate product IDs', () => {
  const candidate = parseAiRecipeCandidate({
    ...valid,
    ingredients: [
      { productId: 'eggs', quantity: 2 },
      { productId: 'eggs', quantity: 2 },
    ],
  })
  expect(mergeCandidateIngredients(candidate.ingredients)).toEqual([{ productId: 'eggs', quantity: 4 }])
  expect(candidate.instructions).toHaveLength(2)
})

test('rejects malformed candidates, unknown products, and over-stock quantities', () => {
  expect(() => parseAiRecipeCandidate('not-json')).toThrow(DomainError)
  expect(() => parseAiRecipeCandidate({ ...valid, servings: 0 })).toThrow(DomainError)
  expect(() => parseAiRecipeCandidate({ ...valid, ingredients: [] })).toThrow(DomainError)
  expect(() => parseAiRecipeCandidate({ ...valid, instructions: [''] })).toThrow(DomainError)
  expect(() => parseAiRecipeCandidate({ ...valid, ingredients: [{ productId: 'eggs', quantity: -1 }] })).toThrow(
    DomainError,
  )

  const candidate = parseAiRecipeCandidate(valid)
  expect(() =>
    validateCandidateAgainstInventory(
      { ...candidate, ingredients: [{ productId: 'onion', quantity: 1 }] },
      inventory,
    ),
  ).toThrow(/Unknown product/)
  expect(() =>
    validateCandidateAgainstInventory(
      { ...candidate, ingredients: [{ productId: 'eggs', quantity: 40 }] },
      inventory,
    ),
  ).toThrow(/Quantity exceeds inventory/)
})

test('maps valid ingredients onto Pantry product names and units', () => {
  const ingredients = validateCandidateAgainstInventory(parseAiRecipeCandidate(valid), inventory)
  expect(ingredients).toEqual([
    { productId: 'eggs', name: 'Ouă', quantity: 4, unit: 'each' },
    { productId: 'chicken', name: 'Piept de pui', quantity: 150, unit: 'g' },
  ])
})
