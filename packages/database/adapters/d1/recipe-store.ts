import {
  DomainError,
  aiGenerationLimitPerHour,
  aiRateLimitRetryAfterSeconds,
  aiRateLimitWindowStart,
  buildConsumptionPlan,
  type RecipeIngredient,
  type RecipeNutrition,
  type RecipeStore,
  type SavedRecipe,
  type Unit,
} from '@pantry/core'
import type { D1DatabaseLike } from './d1-like.js'
import { isConflictGuardError, lotConsumptionStatements } from './lot-consumption.js'
import { createD1InventoryStore } from './inventory-store.js'
import { createD1ProductStore } from './product-store.js'

type RecipeRow = {
  id: string
  title: string
  description: string | null
  servings: number
  time_minutes: number | null
  instructions_json: string
  created_at: string
}

type IngredientRow = {
  product_id: string | null
  product_name: string
  quantity: number
  unit: Unit
}

type NutritionRow = {
  energy_kcal_total: number | null
  protein_g_total: number | null
  carbohydrates_g_total: number | null
  fat_g_total: number | null
  energy_kcal_per_serving: number | null
  protein_g_per_serving: number | null
  carbohydrates_g_per_serving: number | null
  fat_g_per_serving: number | null
  calculable_ingredients: number
  total_ingredients: number
  is_complete: number
}

type SummaryRow = {
  id: string
  title: string
  servings: number
  time_minutes: number | null
  created_at: string
}

type RateLimitRow = {
  count: number
}

function newId(): string {
  return crypto.randomUUID()
}

function nowIso(): string {
  return new Date().toISOString()
}

function parseInstructions(raw: string): string[] {
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed) || parsed.some((step) => typeof step !== 'string')) {
    return []
  }

  return parsed
}

function toNutrition(row: NutritionRow | null): RecipeNutrition {
  const empty = {
    energyKcal: null,
    proteinG: null,
    carbohydratesG: null,
    fatG: null,
  }

  if (!row) {
    return {
      complete: false,
      calculableIngredients: 0,
      totalIngredients: 0,
      total: empty,
      perServing: empty,
    }
  }

  return {
    complete: row.is_complete === 1,
    calculableIngredients: row.calculable_ingredients,
    totalIngredients: row.total_ingredients,
    total: {
      energyKcal: row.energy_kcal_total,
      proteinG: row.protein_g_total,
      carbohydratesG: row.carbohydrates_g_total,
      fatG: row.fat_g_total,
    },
    perServing: {
      energyKcal: row.energy_kcal_per_serving,
      proteinG: row.protein_g_per_serving,
      carbohydratesG: row.carbohydrates_g_per_serving,
      fatG: row.fat_g_per_serving,
    },
  }
}

function toSavedRecipe(
  row: RecipeRow,
  ingredients: RecipeIngredient[],
  nutrition: RecipeNutrition,
): SavedRecipe {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    servings: row.servings,
    timeMinutes: row.time_minutes,
    ingredients,
    instructions: parseInstructions(row.instructions_json),
    notes: null,
    nutrition,
    constraintVerification: 'not_requested',
    createdAt: row.created_at,
  }
}

export function createD1RecipeStore(db: D1DatabaseLike): RecipeStore {
  const products = createD1ProductStore(db)
  const inventory = createD1InventoryStore(db)

  async function readIngredients(recipeId: string): Promise<RecipeIngredient[]> {
    const result = await db
      .prepare(
        `SELECT product_id, product_name, quantity, unit
         FROM recipe_ingredients
         WHERE recipe_id = ?1
         ORDER BY position ASC`,
      )
      .bind(recipeId)
      .all<IngredientRow>()

    return result.results.map((row) => ({
      productId: row.product_id,
      name: row.product_name,
      quantity: row.quantity,
      unit: row.unit,
    }))
  }

  async function readNutrition(recipeId: string): Promise<RecipeNutrition> {
    const row = await db
      .prepare(
        `SELECT energy_kcal_total, protein_g_total, carbohydrates_g_total, fat_g_total,
                energy_kcal_per_serving, protein_g_per_serving, carbohydrates_g_per_serving, fat_g_per_serving,
                calculable_ingredients, total_ingredients, is_complete
         FROM recipe_nutrition
         WHERE recipe_id = ?1`,
      )
      .bind(recipeId)
      .first<NutritionRow>()

    return toNutrition(row)
  }

  async function readRecipe(householdId: string, recipeId: string): Promise<SavedRecipe | null> {
    const row = await db
      .prepare(
        `SELECT id, title, description, servings, time_minutes, instructions_json, created_at
         FROM recipes
         WHERE id = ?1 AND household_id = ?2`,
      )
      .bind(recipeId, householdId)
      .first<RecipeRow>()

    if (!row) {
      return null
    }

    return toSavedRecipe(row, await readIngredients(row.id), await readNutrition(row.id))
  }

  return {
    async reserveAiGeneration(input) {
      const now = input.now ?? new Date()
      const windowStart = aiRateLimitWindowStart(now)
      const limit = aiGenerationLimitPerHour()
      const reserved = await db
        .prepare(
          `INSERT INTO ai_rate_limits (user_id, window_start, count)
           VALUES (?1, ?2, 1)
           ON CONFLICT (user_id, window_start) DO UPDATE SET
             count = ai_rate_limits.count + 1
           WHERE ai_rate_limits.count < ?3
           RETURNING count`,
        )
        .bind(input.userId, windowStart, limit)
        .all<RateLimitRow>()

      const count = reserved.results[0]?.count
      if (count == null) {
        return { ok: false, retryAfter: aiRateLimitRetryAfterSeconds(now) }
      }

      return { ok: true, count }
    },

    async createGeneratedRecipe(input) {
      const id = newId()
      const now = nowIso()
      const recipe = input.recipe

      await db.batch([
        db
          .prepare(
            `INSERT INTO recipes (
               id, household_id, created_by_user_id, title, description, servings, time_minutes,
               instructions_json, source, ai_model, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'ai', ?9, ?10, ?10)`,
          )
          .bind(
            id,
            input.householdId,
            input.userId,
            recipe.title,
            recipe.description,
            recipe.servings,
            recipe.timeMinutes,
            JSON.stringify(recipe.instructions),
            input.aiModel,
            now,
          ),
        ...recipe.ingredients.map((ingredient, position) =>
          db
            .prepare(
              `INSERT INTO recipe_ingredients (
                 recipe_id, position, product_id, product_name, quantity, unit
               ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
            )
            .bind(
              id,
              position,
              ingredient.productId,
              ingredient.name,
              ingredient.quantity,
              ingredient.unit,
            ),
        ),
        db
          .prepare(
            `INSERT INTO recipe_nutrition (
               recipe_id, energy_kcal_total, protein_g_total, carbohydrates_g_total, fat_g_total,
               energy_kcal_per_serving, protein_g_per_serving, carbohydrates_g_per_serving, fat_g_per_serving,
               calculable_ingredients, total_ingredients, is_complete, calculated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`,
          )
          .bind(
            id,
            recipe.nutrition.total.energyKcal,
            recipe.nutrition.total.proteinG,
            recipe.nutrition.total.carbohydratesG,
            recipe.nutrition.total.fatG,
            recipe.nutrition.perServing.energyKcal,
            recipe.nutrition.perServing.proteinG,
            recipe.nutrition.perServing.carbohydratesG,
            recipe.nutrition.perServing.fatG,
            recipe.nutrition.calculableIngredients,
            recipe.nutrition.totalIngredients,
            recipe.nutrition.complete ? 1 : 0,
            now,
          ),
      ])

      const saved = await readRecipe(input.householdId, id)
      if (!saved) {
        throw new DomainError('NOT_FOUND', 'Not found')
      }

      return {
        ...saved,
        constraintVerification: recipe.constraintVerification,
        notes: recipe.notes,
      }
    },

    async listRecentRecipes(input) {
      const limit = input.limit && input.limit > 0 ? Math.min(input.limit, 20) : 20
      const result = await db
        .prepare(
          `SELECT id, title, servings, time_minutes, created_at
           FROM recipes
           WHERE household_id = ?1
           ORDER BY created_at DESC, rowid DESC
           LIMIT ?2`,
        )
        .bind(input.householdId, limit)
        .all<SummaryRow>()

      return result.results.map((row) => ({
        id: row.id,
        title: row.title,
        servings: row.servings,
        timeMinutes: row.time_minutes,
        createdAt: row.created_at,
      }))
    },

    async getRecipe(input) {
      return readRecipe(input.householdId, input.recipeId)
    },

    async cookRecipe(input) {
      const recipe = await readRecipe(input.householdId, input.recipeId)
      if (!recipe) {
        throw new DomainError('NOT_FOUND', 'Not found')
      }

      const now = nowIso()
      const statements = []

      for (const ingredient of recipe.ingredients) {
        if (!ingredient.productId) {
          throw new DomainError('INSUFFICIENT_STOCK', 'INSUFFICIENT_STOCK', { available: 0 })
        }

        const product = await products.getReadableProduct({
          householdId: input.householdId,
          productId: ingredient.productId,
        })
        if (!product) {
          throw new DomainError('INSUFFICIENT_STOCK', 'INSUFFICIENT_STOCK', { available: 0 })
        }

        const lots = await inventory.readLotsForConsumption({
          householdId: input.householdId,
          productId: product.id,
        })
        const plan = buildConsumptionPlan(ingredient.quantity, lots)
        if (!plan.ok) {
          throw new DomainError('INSUFFICIENT_STOCK', 'INSUFFICIENT_STOCK', {
            available: plan.available,
          })
        }

        statements.push(
          ...lotConsumptionStatements(db, {
            householdId: input.householdId,
            userId: input.userId,
            productId: product.id,
            unit: ingredient.unit,
            allocations: plan.allocations,
            now,
          }),
        )
      }

      statements.push(
        db
          .prepare(
            `INSERT INTO recipe_cooks (id, recipe_id, household_id, user_id, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)`,
          )
          .bind(newId(), recipe.id, input.householdId, input.userId, now),
      )

      try {
        await db.batch(statements)
      } catch (error) {
        if (isConflictGuardError(error)) {
          throw new DomainError('STOCK_CONFLICT', 'STOCK_CONFLICT')
        }

        throw error
      }
    },
  }
}
