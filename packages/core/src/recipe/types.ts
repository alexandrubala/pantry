import type { ProductNutrition } from '../product/nutrition.js'
import type { Unit } from '../product/units.js'

export const RECIPE_MODES = ['balanced', 'low_calorie', 'high_protein'] as const
export type RecipeMode = (typeof RECIPE_MODES)[number]

export const MIN_RECIPE_SERVINGS = 1
export const MAX_RECIPE_SERVINGS = 8
export const DEFAULT_RECIPE_SERVINGS = 2
export const MAX_RECIPE_PREFERENCE_LENGTH = 200
export const MAX_RECIPE_TIME_MINUTES = 240
export const MAX_CALORIES_PER_SERVING = 5000
export const MAX_PROTEIN_PER_SERVING = 250
export const AI_GENERATION_LIMIT_PER_HOUR = 10

export type RecipeGenerationRequest = {
  servings: number
  mode: RecipeMode
  maxCaloriesPerServing: number | null
  minProteinPerServing: number | null
  maxTimeMinutes: number | null
  preference: string | null
}

export type InventoryProductContext = {
  productId: string
  name: string
  brand: string | null
  unit: Unit
  availableQuantity: number
  packageQuantity: number | null
  packageUnit: Unit | null
  nutrition: {
    energyKcal100g: number | null
    proteinG100g: number | null
    carbohydratesG100g: number | null
    fatG100g: number | null
  } | null
}

export type AiRecipeIngredient = {
  productId: string
  quantity: number
}

export type AiRecipeCandidate = {
  title: string
  description: string | null
  servings: number
  timeMinutes: number | null
  ingredients: AiRecipeIngredient[]
  instructions: string[]
  notes: string | null
}

export type RecipeIngredient = {
  productId: string | null
  name: string
  quantity: number
  unit: Unit
}

export type RecipeNutrientTotals = {
  energyKcal: number | null
  proteinG: number | null
  carbohydratesG: number | null
  fatG: number | null
}

export type RecipeNutrition = {
  complete: boolean
  calculableIngredients: number
  totalIngredients: number
  total: RecipeNutrientTotals
  perServing: RecipeNutrientTotals
}

export type ConstraintVerification = 'met' | 'violated' | 'incomplete' | 'not_requested'

export type GeneratedRecipe = {
  title: string
  description: string | null
  servings: number
  timeMinutes: number | null
  ingredients: RecipeIngredient[]
  instructions: string[]
  notes: string | null
  nutrition: RecipeNutrition
  constraintVerification: ConstraintVerification
}

export type SavedRecipe = GeneratedRecipe & {
  id: string
  createdAt: string
}

export type RecipeSummary = {
  id: string
  title: string
  servings: number
  timeMinutes: number | null
  createdAt: string
}

export type RecipeProductSnapshot = {
  productId: string
  name: string
  unit: Unit
  availableQuantity: number
  packageQuantity: number | null
  packageUnit: Unit | null
  nutrition: ProductNutrition | null
}
