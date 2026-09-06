import { expect, test } from 'vitest'
import { createWorkersAiProvider, parseWorkersAiRecipeResponse } from './workers-ai-provider.js'

const LIVE = process.env.RUN_LIVE_WORKERS_AI === '1'
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
const TOKEN = process.env.CLOUDFLARE_API_TOKEN
const MODEL = process.env.AI_MODEL ?? '@cf/meta/llama-4-scout-17b-16e-instruct'

test('parses Workers AI structured recipe responses', () => {
  expect(
    parseWorkersAiRecipeResponse({
      response: { title: 'Omletă', servings: 2, ingredients: [{ productId: 'egg-1', quantity: 2 }], instructions: ['Bate'] },
    }),
  ).toMatchObject({ title: 'Omletă' })
  expect(
    parseWorkersAiRecipeResponse({
      choices: [{ message: { content: '{"title":"Omletă","servings":2,"ingredients":[{"productId":"egg-1","quantity":2}],"instructions":["Bate"]}' } }],
    }),
  ).toMatchObject({ title: 'Omletă' })
})

test.skipIf(!LIVE || !ACCOUNT_ID || !TOKEN)(
  'live Workers AI returns structured recipe IDs from a tiny synthetic inventory',
  async () => {
    const provider = createWorkersAiProvider(
      {
        async run(_model, inputs) {
          const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${MODEL}`, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${TOKEN}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify(inputs),
          })
          const payload = (await response.json()) as { success: boolean; result: unknown }
          if (!response.ok || !payload.success) {
            throw new Error('Workers AI request failed')
          }
          return payload.result
        },
      },
      MODEL,
    )

    const raw = await provider.generateRecipe({
      inventory: [
        {
          productId: 'egg-1',
          name: 'Ouă',
          brand: null,
          unit: 'each',
          availableQuantity: 6,
          packageQuantity: null,
          packageUnit: null,
          nutrition: { energyKcal100g: 143, proteinG100g: 13, carbohydratesG100g: 1, fatG100g: 10 },
        },
      ],
      request: {
        servings: 1,
        mode: 'balanced',
        maxCaloriesPerServing: null,
        minProteinPerServing: null,
        maxTimeMinutes: 15,
        preference: null,
      },
    })

    expect(raw).toEqual(
      expect.objectContaining({
        ingredients: expect.arrayContaining([expect.objectContaining({ productId: 'egg-1' })]),
      }),
    )
    const ingredients = (raw as { ingredients: Array<{ productId: string }> }).ingredients
    expect(ingredients.every((ingredient) => ingredient.productId === 'egg-1')).toBe(true)
  },
)
