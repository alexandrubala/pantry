import { DomainError } from '../errors.js'
import {
  DEFAULT_RECIPE_SERVINGS,
  MAX_CALORIES_PER_SERVING,
  MAX_PROTEIN_PER_SERVING,
  MAX_RECIPE_PREFERENCE_LENGTH,
  MAX_RECIPE_SERVINGS,
  MAX_RECIPE_TIME_MINUTES,
  MIN_RECIPE_SERVINGS,
  RECIPE_MODES,
  type RecipeGenerationRequest,
  type RecipeMode,
} from './types.js'

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function optionalPositiveNumber(
  value: unknown,
  max: number,
  field: string,
): number | null {
  if (value == null || value === '') {
    return null
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > max) {
    throw new DomainError('INVALID_GENERATION_REQUEST', `Invalid ${field}`)
  }

  return value
}

function optionalInteger(value: unknown, max: number, field: string): number | null {
  if (value == null || value === '') {
    return null
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > max) {
    throw new DomainError('INVALID_GENERATION_REQUEST', `Invalid ${field}`)
  }

  return value
}

export function parseRecipeGenerationRequest(value: unknown): RecipeGenerationRequest {
  const body = readRecord(value) ?? {}

  const servings =
    body.servings == null ? DEFAULT_RECIPE_SERVINGS : body.servings
  if (
    typeof servings !== 'number' ||
    !Number.isInteger(servings) ||
    servings < MIN_RECIPE_SERVINGS ||
    servings > MAX_RECIPE_SERVINGS
  ) {
    throw new DomainError('INVALID_GENERATION_REQUEST', 'Invalid servings')
  }

  const mode = body.mode == null ? 'balanced' : body.mode
  if (typeof mode !== 'string' || !RECIPE_MODES.includes(mode as RecipeMode)) {
    throw new DomainError('INVALID_GENERATION_REQUEST', 'Invalid mode')
  }

  let preference: string | null = null
  if (body.preference != null && body.preference !== '') {
    if (typeof body.preference !== 'string') {
      throw new DomainError('INVALID_GENERATION_REQUEST', 'Invalid preference')
    }
    const trimmed = body.preference.trim().replace(/\s+/g, ' ')
    if (trimmed.length > MAX_RECIPE_PREFERENCE_LENGTH) {
      throw new DomainError('INVALID_GENERATION_REQUEST', 'Invalid preference')
    }
    preference = trimmed.length > 0 ? trimmed : null
  }

  return {
    servings,
    mode: mode as RecipeMode,
    maxCaloriesPerServing: optionalPositiveNumber(
      body.maxCaloriesPerServing,
      MAX_CALORIES_PER_SERVING,
      'maxCaloriesPerServing',
    ),
    minProteinPerServing: optionalPositiveNumber(
      body.minProteinPerServing,
      MAX_PROTEIN_PER_SERVING,
      'minProteinPerServing',
    ),
    maxTimeMinutes: optionalInteger(body.maxTimeMinutes, MAX_RECIPE_TIME_MINUTES, 'maxTimeMinutes'),
    preference,
  }
}
