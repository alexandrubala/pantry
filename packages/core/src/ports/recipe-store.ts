import type {
  GeneratedRecipe,
  RecipeSummary,
  SavedRecipe,
} from '../recipe/types.js'

export type AiGenerationReservation =
  | { ok: true; count: number }
  | { ok: false; retryAfter: number }

export type RecipeStore = {
  reserveAiGeneration(input: { userId: string; now?: Date }): Promise<AiGenerationReservation>
  createGeneratedRecipe(input: {
    householdId: string
    userId: string
    aiModel: string
    recipe: GeneratedRecipe
  }): Promise<SavedRecipe>
  listRecentRecipes(input: { householdId: string; limit?: number }): Promise<RecipeSummary[]>
  getRecipe(input: { householdId: string; recipeId: string }): Promise<SavedRecipe | null>
  cookRecipe(input: { householdId: string; userId: string; recipeId: string }): Promise<void>
}
