import type { InventoryProductContext, RecipeIngredient, RecipeNutrientTotals, RecipeNutrition } from './types.js'

function roundNutrient(value: number): number {
  return Math.round(value * 100) / 100
}

function gramsForIngredient(
  ingredient: RecipeIngredient,
  product: InventoryProductContext | undefined,
): number | null {
  if (ingredient.unit === 'g') {
    return ingredient.quantity
  }

  if (
    ingredient.unit === 'package' &&
    product?.packageQuantity != null &&
    product.packageQuantity > 0 &&
    product.packageUnit === 'g'
  ) {
    return ingredient.quantity * product.packageQuantity
  }

  return null
}

function scalePer100g(per100g: number | null, grams: number): number | null {
  if (per100g == null || !Number.isFinite(per100g)) {
    return null
  }

  return roundNutrient((per100g * grams) / 100)
}

function addKnown(sum: number, next: number | null): { sum: number; known: boolean } {
  if (next == null) {
    return { sum, known: false }
  }

  return { sum: roundNutrient(sum + next), known: true }
}

function perServing(total: number | null, servings: number): number | null {
  if (total == null || servings <= 0) {
    return null
  }

  return roundNutrient(total / servings)
}

export function calculateRecipeNutrition(input: {
  ingredients: readonly RecipeIngredient[]
  inventory: readonly InventoryProductContext[]
  servings: number
}): RecipeNutrition {
  const byId = new Map(input.inventory.map((item) => [item.productId, item]))
  let calculableIngredients = 0
  let energySum = 0
  let proteinSum = 0
  let carbsSum = 0
  let fatSum = 0
  let energyKnown = true
  let proteinKnown = true
  let carbsKnown = true
  let fatKnown = true

  for (const ingredient of input.ingredients) {
    const product = ingredient.productId ? byId.get(ingredient.productId) : undefined
    const grams = gramsForIngredient(ingredient, product)
    if (grams == null || grams <= 0 || !product?.nutrition) {
      continue
    }

    calculableIngredients += 1
    const nutrition = product.nutrition
    const energy = addKnown(energySum, scalePer100g(nutrition.energyKcal100g, grams))
    energySum = energy.sum
    energyKnown = energyKnown && energy.known
    const protein = addKnown(proteinSum, scalePer100g(nutrition.proteinG100g, grams))
    proteinSum = protein.sum
    proteinKnown = proteinKnown && protein.known
    const carbs = addKnown(carbsSum, scalePer100g(nutrition.carbohydratesG100g, grams))
    carbsSum = carbs.sum
    carbsKnown = carbsKnown && carbs.known
    const fat = addKnown(fatSum, scalePer100g(nutrition.fatG100g, grams))
    fatSum = fat.sum
    fatKnown = fatKnown && fat.known
  }

  const complete = calculableIngredients === input.ingredients.length && input.ingredients.length > 0
  const total: RecipeNutrientTotals = {
    energyKcal: energyKnown && calculableIngredients > 0 ? energySum : null,
    proteinG: proteinKnown && calculableIngredients > 0 ? proteinSum : null,
    carbohydratesG: carbsKnown && calculableIngredients > 0 ? carbsSum : null,
    fatG: fatKnown && calculableIngredients > 0 ? fatSum : null,
  }

  return {
    complete,
    calculableIngredients,
    totalIngredients: input.ingredients.length,
    total,
    perServing: {
      energyKcal: perServing(total.energyKcal, input.servings),
      proteinG: perServing(total.proteinG, input.servings),
      carbohydratesG: perServing(total.carbohydratesG, input.servings),
      fatG: perServing(total.fatG, input.servings),
    },
  }
}
