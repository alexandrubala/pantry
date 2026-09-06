export const AI_RECIPE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 120 },
    description: { type: 'string', maxLength: 500 },
    servings: { type: 'integer', minimum: 1, maximum: 8 },
    timeMinutes: { type: 'integer', minimum: 1, maximum: 240 },
    ingredients: {
      type: 'array',
      minItems: 1,
      maxItems: 30,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          productId: { type: 'string', minLength: 1 },
          quantity: { type: 'number', exclusiveMinimum: 0 },
        },
        required: ['productId', 'quantity'],
      },
    },
    instructions: {
      type: 'array',
      minItems: 1,
      maxItems: 20,
      items: { type: 'string', minLength: 1, maxLength: 500 },
    },
    notes: { type: 'string', maxLength: 500 },
  },
  required: ['title', 'servings', 'ingredients', 'instructions'],
} as const
