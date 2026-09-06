import { DomainError } from '../errors.js'
import { inventoryContextById } from './context.js'
import {
  MAX_RECIPE_SERVINGS,
  MAX_RECIPE_TIME_MINUTES,
  MIN_RECIPE_SERVINGS,
  type AiRecipeCandidate,
  type AiRecipeIngredient,
  type InventoryProductContext,
  type RecipeIngredient,
} from './types.js'

const MAX_TITLE_LENGTH = 120
const MAX_TEXT_LENGTH = 500
const MAX_INSTRUCTIONS = 20
const MAX_INGREDIENTS = 30

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function optionalText(value: unknown, field: string): string | null {
  if (value == null) {
    return null
  }

  if (typeof value !== 'string') {
    throw new DomainError('AI_GENERATION_FAILED', `Invalid ${field}`)
  }

  const text = value.trim().replace(/\s+/g, ' ')
  if (!text) {
    return null
  }

  if (text.length > MAX_TEXT_LENGTH) {
    throw new DomainError('AI_GENERATION_FAILED', `Invalid ${field}`)
  }

  return text
}

function requiredTitle(value: unknown): string {
  if (typeof value !== 'string') {
    throw new DomainError('AI_GENERATION_FAILED', 'Invalid title')
  }

  const title = value.trim().replace(/\s+/g, ' ')
  if (!title || title.length > MAX_TITLE_LENGTH) {
    throw new DomainError('AI_GENERATION_FAILED', 'Invalid title')
  }

  return title
}

function parseServings(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < MIN_RECIPE_SERVINGS || value > MAX_RECIPE_SERVINGS) {
    throw new DomainError('AI_GENERATION_FAILED', 'Invalid servings')
  }

  return value
}

function parseTimeMinutes(value: unknown): number | null {
  if (value == null) {
    return null
  }

  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value <= 0 ||
    value > MAX_RECIPE_TIME_MINUTES
  ) {
    throw new DomainError('AI_GENERATION_FAILED', 'Invalid timeMinutes')
  }

  return value
}

function parseInstructions(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_INSTRUCTIONS) {
    throw new DomainError('AI_GENERATION_FAILED', 'Invalid instructions')
  }

  const instructions: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') {
      throw new DomainError('AI_GENERATION_FAILED', 'Invalid instructions')
    }
    const step = entry.trim().replace(/\s+/g, ' ')
    if (!step || step.length > MAX_TEXT_LENGTH) {
      throw new DomainError('AI_GENERATION_FAILED', 'Invalid instructions')
    }
    instructions.push(step)
  }

  return instructions
}

function parseRawIngredients(value: unknown): AiRecipeIngredient[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_INGREDIENTS) {
    throw new DomainError('AI_GENERATION_FAILED', 'Invalid ingredients')
  }

  const ingredients: AiRecipeIngredient[] = []
  for (const entry of value) {
    const row = readRecord(entry)
    if (!row || typeof row.productId !== 'string') {
      throw new DomainError('AI_GENERATION_FAILED', 'Invalid ingredients')
    }

    const productId = row.productId.trim()
    if (!productId) {
      throw new DomainError('AI_GENERATION_FAILED', 'Invalid ingredients')
    }

    if (typeof row.quantity !== 'number' || !Number.isFinite(row.quantity) || row.quantity <= 0) {
      throw new DomainError('AI_GENERATION_FAILED', 'Invalid ingredients')
    }

    ingredients.push({ productId, quantity: row.quantity })
  }

  return ingredients
}

export function mergeCandidateIngredients(
  ingredients: readonly AiRecipeIngredient[],
): AiRecipeIngredient[] {
  const merged = new Map<string, number>()
  const order: string[] = []

  for (const ingredient of ingredients) {
    const current = merged.get(ingredient.productId)
    if (current == null) {
      order.push(ingredient.productId)
      merged.set(ingredient.productId, ingredient.quantity)
    } else {
      merged.set(ingredient.productId, current + ingredient.quantity)
    }
  }

  return order.map((productId) => ({
    productId,
    quantity: merged.get(productId) ?? 0,
  }))
}

export function parseAiRecipeCandidate(value: unknown): AiRecipeCandidate {
  const body = readRecord(value)
  if (!body) {
    throw new DomainError('AI_GENERATION_FAILED', 'Invalid recipe')
  }

  return {
    title: requiredTitle(body.title),
    description: optionalText(body.description, 'description'),
    servings: parseServings(body.servings),
    timeMinutes: parseTimeMinutes(body.timeMinutes),
    ingredients: mergeCandidateIngredients(parseRawIngredients(body.ingredients)),
    instructions: parseInstructions(body.instructions),
    notes: optionalText(body.notes, 'notes'),
  }
}

export function validateCandidateAgainstInventory(
  candidate: AiRecipeCandidate,
  inventory: readonly InventoryProductContext[],
): RecipeIngredient[] {
  const byId = inventoryContextById(inventory)
  const ingredients: RecipeIngredient[] = []

  for (const ingredient of candidate.ingredients) {
    const product = byId.get(ingredient.productId)
    if (!product) {
      throw new DomainError('AI_GENERATION_FAILED', 'Unknown product')
    }

    if (ingredient.quantity > product.availableQuantity + 1e-9) {
      throw new DomainError('AI_GENERATION_FAILED', 'Quantity exceeds inventory')
    }

    ingredients.push({
      productId: product.productId,
      name: product.name,
      quantity: Math.min(ingredient.quantity, product.availableQuantity),
      unit: product.unit,
    })
  }

  return ingredients
}
