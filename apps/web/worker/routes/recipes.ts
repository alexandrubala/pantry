import { Hono } from 'hono'
import {
  DomainError,
  httpStatusForDomainError,
  isDomainError,
  type HouseholdStore,
  type RecipeStore,
} from '@pantry/core'
import { createD1HouseholdStore, createD1RecipeStore } from '@pantry/database/d1'
import { requireAuth } from '../auth/authorize.js'
import { ensureProfile } from '../profiles/profile.js'
import { publicRecipe } from './ai.js'

export const recipes = new Hono<{ Bindings: CloudflareBindings }>()

function householdStore(db: D1Database): HouseholdStore {
  return createD1HouseholdStore(db)
}

function recipeStore(db: D1Database): RecipeStore {
  return createD1RecipeStore(db)
}

function domainResponse(error: DomainError) {
  return {
    body: {
      error:
        error.code === 'INSUFFICIENT_STOCK' || error.code === 'STOCK_CONFLICT' ? error.code : error.message,
      code: error.code,
      ...(error.available != null ? { available: error.available } : {}),
    },
    status: httpStatusForDomainError(error.code),
  }
}

async function requireActiveHousehold(env: CloudflareBindings, userId: string) {
  const household = await householdStore(env.DB).getActiveHousehold(userId)
  if (!household) {
    throw new DomainError('HOUSEHOLD_REQUIRED', 'Household setup required')
  }

  return { household, recipes: recipeStore(env.DB) }
}

recipes.get('/recipes', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)

  try {
    const { household, recipes: store } = await requireActiveHousehold(c.env, user.id)
    const recent = await store.listRecentRecipes({ householdId: household.id, limit: 20 })
    return c.json({ recipes: recent })
  } catch (error) {
    if (isDomainError(error)) {
      const mapped = domainResponse(error)
      return c.json(mapped.body, mapped.status)
    }
    throw error
  }
})

recipes.get('/recipes/:id', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)
  const recipeId = c.req.param('id').trim()
  if (!recipeId) {
    return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)
  }

  try {
    const { household, recipes: store } = await requireActiveHousehold(c.env, user.id)
    const recipe = await store.getRecipe({ householdId: household.id, recipeId })
    if (!recipe) {
      return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)
    }
    return c.json({ recipe: publicRecipe(recipe) })
  } catch (error) {
    if (isDomainError(error)) {
      const mapped = domainResponse(error)
      return c.json(mapped.body, mapped.status)
    }
    throw error
  }
})

recipes.post('/recipes/:id/cook', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)
  const recipeId = c.req.param('id').trim()
  if (!recipeId) {
    return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)
  }

  try {
    const { household, recipes: store } = await requireActiveHousehold(c.env, user.id)
    await store.cookRecipe({
      householdId: household.id,
      userId: user.id,
      recipeId,
    })
    return c.json({ cooked: true })
  } catch (error) {
    if (isDomainError(error)) {
      const mapped = domainResponse(error)
      return c.json(mapped.body, mapped.status)
    }
    throw error
  }
})
