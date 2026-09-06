import { expect, test } from 'vitest'
import { DomainError } from '../errors.js'
import { parseRecipeGenerationRequest } from './request.js'

test('parses defaults and optional generation fields', () => {
  expect(parseRecipeGenerationRequest({})).toEqual({
    servings: 2,
    mode: 'balanced',
    maxCaloriesPerServing: null,
    minProteinPerServing: null,
    maxTimeMinutes: null,
    preference: null,
  })

  expect(
    parseRecipeGenerationRequest({
      servings: 3,
      mode: 'high_protein',
      maxCaloriesPerServing: 600,
      minProteinPerServing: 40,
      maxTimeMinutes: 30,
      preference: '  ceva cu ouă  ',
    }),
  ).toEqual({
    servings: 3,
    mode: 'high_protein',
    maxCaloriesPerServing: 600,
    minProteinPerServing: 40,
    maxTimeMinutes: 30,
    preference: 'ceva cu ouă',
  })
})

test('rejects out-of-range generation request fields', () => {
  expect(() => parseRecipeGenerationRequest({ servings: 0 })).toThrow(DomainError)
  expect(() => parseRecipeGenerationRequest({ servings: 9 })).toThrow(DomainError)
  expect(() => parseRecipeGenerationRequest({ mode: 'keto' })).toThrow(DomainError)
  expect(() => parseRecipeGenerationRequest({ maxCaloriesPerServing: -1 })).toThrow(DomainError)
  expect(() => parseRecipeGenerationRequest({ preference: 'x'.repeat(201) })).toThrow(DomainError)
  expect(() => parseRecipeGenerationRequest({ maxTimeMinutes: 0 })).toThrow(DomainError)
})
