import { expect, test } from 'vitest'
import { calculateRecipeNutrition } from './nutrition.js'
import type { InventoryProductContext, RecipeIngredient } from './types.js'

const chicken: InventoryProductContext = {
  productId: 'chicken',
  name: 'Piept de pui',
  brand: null,
  unit: 'g',
  availableQuantity: 500,
  packageQuantity: null,
  packageUnit: null,
  nutrition: { energyKcal100g: 110, proteinG100g: 23, carbohydratesG100g: 0, fatG100g: 1.2 },
}

const yogurtPack: InventoryProductContext = {
  productId: 'yogurt',
  name: 'Iaurt grecesc',
  brand: null,
  unit: 'package',
  availableQuantity: 2,
  packageQuantity: 500,
  packageUnit: 'g',
  nutrition: { energyKcal100g: 80, proteinG100g: 10, carbohydratesG100g: 4, fatG100g: 2 },
}

const eggs: InventoryProductContext = {
  productId: 'eggs',
  name: 'Ouă',
  brand: null,
  unit: 'each',
  availableQuantity: 10,
  packageQuantity: null,
  packageUnit: null,
  nutrition: { energyKcal100g: 143, proteinG100g: 13, carbohydratesG100g: 1, fatG100g: 10 },
}

const milk: InventoryProductContext = {
  productId: 'milk',
  name: 'Lapte',
  brand: null,
  unit: 'ml',
  availableQuantity: 1000,
  packageQuantity: null,
  packageUnit: null,
  nutrition: { energyKcal100g: 46, proteinG100g: 3.4, carbohydratesG100g: 4.8, fatG100g: 1.6 },
}

test('calculates complete nutrition from grams using per-100g values', () => {
  const ingredients: RecipeIngredient[] = [
    { productId: 'chicken', name: 'Piept de pui', quantity: 150, unit: 'g' },
  ]
  const nutrition = calculateRecipeNutrition({ ingredients, inventory: [chicken], servings: 2 })
  expect(nutrition.complete).toBe(true)
  expect(nutrition.total.energyKcal).toBe(165)
  expect(nutrition.total.proteinG).toBe(34.5)
  expect(nutrition.perServing.energyKcal).toBe(82.5)
  expect(nutrition.perServing.proteinG).toBe(17.25)
})

test('converts explicit package → g and does not invent g ↔ ml or each conversions', () => {
  const packageNutrition = calculateRecipeNutrition({
    ingredients: [{ productId: 'yogurt', name: 'Iaurt grecesc', quantity: 1, unit: 'package' }],
    inventory: [yogurtPack],
    servings: 1,
  })
  expect(packageNutrition.complete).toBe(true)
  expect(packageNutrition.total.energyKcal).toBe(400)
  expect(packageNutrition.total.proteinG).toBe(50)

  const mixed = calculateRecipeNutrition({
    ingredients: [
      { productId: 'chicken', name: 'Piept de pui', quantity: 100, unit: 'g' },
      { productId: 'eggs', name: 'Ouă', quantity: 2, unit: 'each' },
      { productId: 'milk', name: 'Lapte', quantity: 200, unit: 'ml' },
    ],
    inventory: [chicken, eggs, milk],
    servings: 2,
  })
  expect(mixed.complete).toBe(false)
  expect(mixed.calculableIngredients).toBe(1)
  expect(mixed.totalIngredients).toBe(3)
  expect(mixed.total.energyKcal).toBe(110)
  expect(mixed.perServing.energyKcal).toBe(55)
})

test('does not treat a missing nutrient as zero', () => {
  const incompleteMacro: InventoryProductContext = {
    ...chicken,
    nutrition: { energyKcal100g: 110, proteinG100g: null, carbohydratesG100g: 0, fatG100g: 1.2 },
  }
  const nutrition = calculateRecipeNutrition({
    ingredients: [{ productId: 'chicken', name: 'Piept de pui', quantity: 100, unit: 'g' }],
    inventory: [incompleteMacro],
    servings: 1,
  })
  expect(nutrition.complete).toBe(true)
  expect(nutrition.total.energyKcal).toBe(110)
  expect(nutrition.total.proteinG).toBeNull()
})
