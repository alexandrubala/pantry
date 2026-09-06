import { expect, test } from 'vitest'
import { DomainError } from '../errors.js'
import type { AiProvider } from '../ports/ai-provider.js'
import type { InventoryItem } from '../ports/inventory-store.js'
import { generateRecipeFromInventory } from './generate.js'
import { parseRecipeGenerationRequest } from './request.js'
import type { AiRecipeCandidate } from './types.js'

function item(partial: {
  id: string
  name: string
  unit: InventoryItem['product']['unit']
  quantity: number
  packageQuantity?: number | null
  packageUnit?: InventoryItem['product']['packageUnit']
  nutrition?: InventoryItem['product']['nutrition']
}): InventoryItem {
  return {
    product: {
      id: partial.id,
      name: partial.name,
      brand: null,
      unit: partial.unit,
      barcode: null,
      imageUrl: null,
      externalCatalog: null,
      packageQuantity: partial.packageQuantity ?? null,
      packageUnit: partial.packageUnit ?? null,
      nutrition: partial.nutrition ?? null,
    },
    totalQuantity: partial.quantity,
    nearestExpiry: null,
    lots: [],
  }
}

const inventory: InventoryItem[] = [
  item({
    id: 'eggs',
    name: 'Ouă',
    unit: 'each',
    quantity: 10,
  }),
  item({
    id: 'chicken',
    name: 'Piept de pui',
    unit: 'g',
    quantity: 500,
    nutrition: { energyKcal100g: 110, proteinG100g: 23, carbohydratesG100g: 0, fatG100g: 1.2, sugarsG100g: null, fiberG100g: null, saltG100g: null, servingSize: null, energyKcalServing: null, proteinGServing: null, carbohydratesGServing: null, fatGServing: null },
  }),
  item({
    id: 'yogurt',
    name: 'Iaurt grecesc',
    unit: 'g',
    quantity: 500,
    nutrition: { energyKcal100g: 80, proteinG100g: 10, carbohydratesG100g: 4, fatG100g: 2, sugarsG100g: null, fiberG100g: null, saltG100g: null, servingSize: null, energyKcalServing: null, proteinGServing: null, carbohydratesGServing: null, fatGServing: null },
  }),
]

function candidate(overrides?: Partial<AiRecipeCandidate>): AiRecipeCandidate {
  return {
    title: 'Bol high protein',
    description: 'Din inventar',
    servings: 2,
    timeMinutes: 20,
    ingredients: [
      { productId: 'chicken', quantity: 200 },
      { productId: 'yogurt', quantity: 150 },
    ],
    instructions: ['Gătește puiul', 'Adaugă iaurt'],
    notes: null,
    ...overrides,
  }
}

function fakeProvider(results: unknown[]): AiProvider {
  let index = 0
  return {
    async generateRecipe() {
      const next = results[index] ?? results[results.length - 1]
      index += 1
      if (next instanceof Error) {
        throw next
      }
      return next
    },
  }
}

const request = parseRecipeGenerationRequest({
  servings: 2,
  mode: 'high_protein',
  maxCaloriesPerServing: 600,
  minProteinPerServing: 40,
})

test('returns a validated recipe with Pantry-calculated nutrition', async () => {
  const recipe = await generateRecipeFromInventory({
    inventory,
    request: parseRecipeGenerationRequest({ servings: 2, mode: 'high_protein' }),
    provider: fakeProvider([candidate()]),
  })
  expect(recipe.ingredients.map((entry) => entry.productId)).toEqual(['chicken', 'yogurt'])
  expect(recipe.nutrition.complete).toBe(true)
  expect(recipe.nutrition.total.energyKcal).toBe(340)
  expect(recipe.nutrition.perServing.proteinG).toBe(30.5)
  expect(recipe.constraintVerification).toBe('not_requested')
})

test('repairs malformed output once, then fails safely', async () => {
  const calls: unknown[] = []
  const provider: AiProvider = {
    async generateRecipe(input) {
      calls.push(input.repairFeedback ?? null)
      if (calls.length === 1) {
        return { title: 'x' }
      }
      return candidate({
        ingredients: [{ productId: 'chicken', quantity: 300 }, { productId: 'yogurt', quantity: 250 }],
      })
    },
  }

  const recipe = await generateRecipeFromInventory({
    inventory,
    request: parseRecipeGenerationRequest({ servings: 2, mode: 'high_protein' }),
    provider,
  })
  expect(calls).toHaveLength(2)
  expect(calls[1]).toEqual(expect.any(String))
  expect(recipe.ingredients).toHaveLength(2)

  await expect(
    generateRecipeFromInventory({
      inventory,
      request,
      provider: fakeProvider([{ title: 'x' }, { title: 'y' }]),
    }),
  ).rejects.toMatchObject({ code: 'AI_GENERATION_FAILED' })
})

test('rejects unknown products and quantities over stock after one repair', async () => {
  await expect(
    generateRecipeFromInventory({
      inventory,
      request,
      provider: fakeProvider([
        candidate({ ingredients: [{ productId: 'onion', quantity: 1 }] }),
        candidate({ ingredients: [{ productId: 'onion', quantity: 1 }] }),
      ]),
    }),
  ).rejects.toMatchObject({ code: 'AI_GENERATION_FAILED' })

  await expect(
    generateRecipeFromInventory({
      inventory,
      request,
      provider: fakeProvider([
        candidate({ ingredients: [{ productId: 'chicken', quantity: 900 }] }),
        candidate({ ingredients: [{ productId: 'chicken', quantity: 900 }] }),
      ]),
    }),
  ).rejects.toMatchObject({ code: 'AI_GENERATION_FAILED' })
})

test('repairs constraint violations once when nutrition is complete', async () => {
  const recipe = await generateRecipeFromInventory({
    inventory,
    request,
    provider: fakeProvider([
      candidate(),
      candidate({
        ingredients: [
          { productId: 'chicken', quantity: 400 },
          { productId: 'yogurt', quantity: 200 },
        ],
      }),
    ]),
  })
  expect(recipe.nutrition.perServing.proteinG).toBeGreaterThanOrEqual(40)
  expect(recipe.constraintVerification).toBe('met')
})

test('does not claim incomplete nutrition meets calorie or protein targets', async () => {
  const recipe = await generateRecipeFromInventory({
    inventory,
    request,
    provider: fakeProvider([
      candidate({
        ingredients: [
          { productId: 'chicken', quantity: 200 },
          { productId: 'eggs', quantity: 4 },
        ],
      }),
    ]),
  })
  expect(recipe.nutrition.complete).toBe(false)
  expect(recipe.constraintVerification).toBe('incomplete')
})

test('throws EMPTY_INVENTORY without calling the provider', async () => {
  let called = 0
  await expect(
    generateRecipeFromInventory({
      inventory: [],
      request,
      provider: {
        async generateRecipe() {
          called += 1
          return candidate()
        },
      },
    }),
  ).rejects.toMatchObject({ code: 'EMPTY_INVENTORY' })
  expect(called).toBe(0)
})

test('maps provider failures as AI_UNAVAILABLE without inventing a recipe', async () => {
  await expect(
    generateRecipeFromInventory({
      inventory,
      request,
      provider: fakeProvider([new DomainError('AI_UNAVAILABLE', 'AI_UNAVAILABLE')]),
    }),
  ).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' })
})
