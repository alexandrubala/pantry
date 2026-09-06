import type { ConstraintVerification, RecipeGenerationRequest, RecipeNutrition } from './types.js'

export function verifyNutritionConstraints(
  request: RecipeGenerationRequest,
  nutrition: RecipeNutrition,
): ConstraintVerification {
  const hasCalorieTarget = request.maxCaloriesPerServing != null
  const hasProteinTarget = request.minProteinPerServing != null
  if (!hasCalorieTarget && !hasProteinTarget) {
    return 'not_requested'
  }

  if (!nutrition.complete) {
    return 'incomplete'
  }

  if (hasCalorieTarget) {
    if (nutrition.perServing.energyKcal == null) {
      return 'incomplete'
    }
    if (nutrition.perServing.energyKcal > request.maxCaloriesPerServing! + 1e-9) {
      return 'violated'
    }
  }

  if (hasProteinTarget) {
    if (nutrition.perServing.proteinG == null) {
      return 'incomplete'
    }
    if (nutrition.perServing.proteinG + 1e-9 < request.minProteinPerServing!) {
      return 'violated'
    }
  }

  return 'met'
}

export function constraintRepairFeedback(
  request: RecipeGenerationRequest,
  verification: ConstraintVerification,
): string {
  const parts = ['The previous recipe did not satisfy the numeric nutrition constraints.']
  if (request.maxCaloriesPerServing != null) {
    parts.push(`Stay at or below ${request.maxCaloriesPerServing} kcal per serving.`)
  }
  if (request.minProteinPerServing != null) {
    parts.push(`Provide at least ${request.minProteinPerServing} g protein per serving.`)
  }
  if (verification === 'violated') {
    parts.push('Reduce calorie-dense ingredients or increase protein-dense Pantry products. Use only supplied product IDs.')
  }
  return parts.join(' ')
}
