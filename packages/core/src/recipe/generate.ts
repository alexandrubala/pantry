import { DomainError } from '../errors.js'
import type { AiProvider } from '../ports/ai-provider.js'
import type { InventoryItem } from '../ports/inventory-store.js'
import { parseAiRecipeCandidate, validateCandidateAgainstInventory } from './candidate.js'
import { constraintRepairFeedback, verifyNutritionConstraints } from './constraints.js'
import { buildInventoryContext } from './context.js'
import { calculateRecipeNutrition } from './nutrition.js'
import type { GeneratedRecipe, InventoryProductContext, RecipeGenerationRequest } from './types.js'

function validationFeedback(error: DomainError): string {
  switch (error.message) {
    case 'Unknown product':
      return 'Use only productId values from the supplied Pantry inventory. Do not invent IDs or names.'
    case 'Quantity exceeds inventory':
      return 'Every ingredient quantity must be greater than 0 and must not exceed availableQuantity for that productId.'
    case 'Invalid instructions':
      return 'Provide a non-empty instructions array of short cooking steps.'
    case 'Invalid servings':
      return 'servings must be an integer from 1 to 8.'
    default:
      return 'Return only the requested recipe JSON schema. Use only supplied product IDs and valid quantities.'
  }
}

async function requestCandidate(
  provider: AiProvider,
  inventory: InventoryProductContext[],
  request: RecipeGenerationRequest,
  repairFeedback?: string,
) {
  const raw = await provider.generateRecipe({
    inventory,
    request,
    repairFeedback,
  })
  const candidate = parseAiRecipeCandidate(raw)
  const ingredients = validateCandidateAgainstInventory(candidate, inventory)
  return { candidate, ingredients }
}

export async function generateRecipeFromInventory(input: {
  inventory: readonly InventoryItem[]
  request: RecipeGenerationRequest
  provider: AiProvider
}): Promise<GeneratedRecipe> {
  const inventory = buildInventoryContext(input.inventory)
  if (inventory.length === 0) {
    throw new DomainError('EMPTY_INVENTORY', 'EMPTY_INVENTORY')
  }

  let usedRepair = false
  let generated: Awaited<ReturnType<typeof requestCandidate>>
  try {
    generated = await requestCandidate(input.provider, inventory, input.request)
  } catch (error) {
    if (!(error instanceof DomainError) || error.code !== 'AI_GENERATION_FAILED') {
      throw error
    }

    usedRepair = true
    try {
      generated = await requestCandidate(
        input.provider,
        inventory,
        input.request,
        validationFeedback(error),
      )
    } catch (retryError) {
      if (retryError instanceof DomainError && retryError.code === 'AI_GENERATION_FAILED') {
        throw new DomainError('AI_GENERATION_FAILED', 'AI_GENERATION_FAILED')
      }
      throw retryError
    }
  }

  const toRecipe = (
    result: Awaited<ReturnType<typeof requestCandidate>>,
  ): GeneratedRecipe => {
    const nutrition = calculateRecipeNutrition({
      ingredients: result.ingredients,
      inventory,
      servings: result.candidate.servings,
    })
    return {
      title: result.candidate.title,
      description: result.candidate.description,
      servings: result.candidate.servings,
      timeMinutes: result.candidate.timeMinutes,
      ingredients: result.ingredients,
      instructions: result.candidate.instructions,
      notes: result.candidate.notes,
      nutrition,
      constraintVerification: verifyNutritionConstraints(input.request, nutrition),
    }
  }

  let recipe = toRecipe(generated)
  if (recipe.constraintVerification !== 'violated') {
    return recipe
  }

  if (usedRepair) {
    throw new DomainError('CONSTRAINT_NOT_MET', 'CONSTRAINT_NOT_MET')
  }

  generated = await requestCandidate(
    input.provider,
    inventory,
    input.request,
    constraintRepairFeedback(input.request, recipe.constraintVerification),
  )
  recipe = toRecipe(generated)
  if (recipe.constraintVerification === 'violated') {
    throw new DomainError('CONSTRAINT_NOT_MET', 'CONSTRAINT_NOT_MET')
  }

  return recipe
}
