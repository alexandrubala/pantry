import { Hono } from 'hono'
import {
  DomainError,
  generateRecipeFromInventory,
  httpStatusForDomainError,
  isDomainError,
  parseRecipeGenerationRequest,
  type HouseholdStore,
  type InventoryStore,
  type RecipeStore,
  type SavedRecipe,
} from '@pantry/core'
import { createD1HouseholdStore, createD1InventoryStore, createD1RecipeStore } from '@pantry/database/d1'
import { requireAuth } from '../auth/authorize.js'
import { ensureProfile } from '../profiles/profile.js'
import { createWorkersAiProvider } from '../ai/workers-ai-provider.js'

export const ai = new Hono<{ Bindings: CloudflareBindings }>()

function householdStore(db: D1Database): HouseholdStore {
  return createD1HouseholdStore(db)
}

function inventoryStore(db: D1Database): InventoryStore {
  return createD1InventoryStore(db)
}

function recipeStore(db: D1Database): RecipeStore {
  return createD1RecipeStore(db)
}

export function publicRecipe(recipe: SavedRecipe) {
  return {
    id: recipe.id,
    title: recipe.title,
    description: recipe.description,
    servings: recipe.servings,
    timeMinutes: recipe.timeMinutes,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
    notes: recipe.notes,
    nutrition: {
      complete: recipe.nutrition.complete,
      calculableIngredients: recipe.nutrition.calculableIngredients,
      totalIngredients: recipe.nutrition.totalIngredients,
      perServing: {
        kcal: recipe.nutrition.perServing.energyKcal,
        protein: recipe.nutrition.perServing.proteinG,
        carbs: recipe.nutrition.perServing.carbohydratesG,
        fat: recipe.nutrition.perServing.fatG,
      },
    },
    constraintVerification: recipe.constraintVerification,
    createdAt: recipe.createdAt,
  }
}

function domainResponse(error: DomainError) {
  if (error.code === 'AI_RATE_LIMIT') {
    return {
      body: { error: 'AI_RATE_LIMIT', retryAfter: error.retryAfter ?? 1 },
      status: 429 as const,
    }
  }

  return {
    body: {
      error:
        error.code === 'EMPTY_INVENTORY' ||
        error.code === 'AI_GENERATION_FAILED' ||
        error.code === 'AI_UNAVAILABLE' ||
        error.code === 'CONSTRAINT_NOT_MET' ||
        error.code === 'INSUFFICIENT_STOCK' ||
        error.code === 'STOCK_CONFLICT'
          ? error.code
          : error.message,
      code: error.code,
      ...(error.available != null ? { available: error.available } : {}),
      ...(error.retryAfter != null ? { retryAfter: error.retryAfter } : {}),
    },
    status: httpStatusForDomainError(error.code),
  }
}

ai.post('/ai/recipes/generate', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)

  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid request', code: 'INVALID_GENERATION_REQUEST' }, 400)
  }

  try {
    const households = householdStore(c.env.DB)
    const household = await households.getActiveHousehold(user.id)
    if (!household) {
      throw new DomainError('HOUSEHOLD_REQUIRED', 'Household setup required')
    }

    const recipes = recipeStore(c.env.DB)
    const reservation = await recipes.reserveAiGeneration({ userId: user.id })
    if (!reservation.ok) {
      throw new DomainError('AI_RATE_LIMIT', 'AI_RATE_LIMIT', { retryAfter: reservation.retryAfter })
    }

    const items = await inventoryStore(c.env.DB).getInventory({ householdId: household.id })
    const request = parseRecipeGenerationRequest(payload)
    const model: string = c.env.AI_MODEL
    if (!model || !c.env.AI) {
      throw new DomainError('AI_UNAVAILABLE', 'AI_UNAVAILABLE')
    }

    const generated = await generateRecipeFromInventory({
      inventory: items,
      request,
      provider: createWorkersAiProvider(c.env.AI, model),
    })
    const recipe = await recipes.createGeneratedRecipe({
      householdId: household.id,
      userId: user.id,
      aiModel: model,
      recipe: generated,
    })
    return c.json({ recipe: publicRecipe(recipe) })
  } catch (error) {
    if (isDomainError(error)) {
      const mapped = domainResponse(error)
      return c.json(mapped.body, mapped.status)
    }
    throw error
  }
})
