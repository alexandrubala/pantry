import type { InventoryProductContext, RecipeGenerationRequest } from '../recipe/types.js'

export type AiRecipeGenerationInput = {
  inventory: InventoryProductContext[]
  request: RecipeGenerationRequest
  repairFeedback?: string
}

export type AiProvider = {
  generateRecipe(input: AiRecipeGenerationInput): Promise<unknown>
}
