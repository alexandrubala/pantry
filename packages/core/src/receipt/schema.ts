export const AI_RECEIPT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    merchant: { type: ['string', 'null'], maxLength: 80 },
    date: { type: ['string', 'null'], maxLength: 16 },
    currency: { type: ['string', 'null'], maxLength: 8 },
    total: { type: ['number', 'null'] },
    items: {
      type: 'array',
      maxItems: 80,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          rawName: { type: 'string', minLength: 1, maxLength: 160 },
          name: { type: 'string', minLength: 1, maxLength: 120 },
          quantity: { type: ['number', 'null'] },
          unit: { type: ['string', 'null'], enum: ['g', 'ml', 'each', 'package', null] },
          lineTotal: { type: ['number', 'null'] },
          weightValue: { type: ['number', 'null'] },
          weightUnit: { type: ['string', 'null'], enum: ['g', 'kg', 'ml', 'l', null] },
          confidence: { type: ['number', 'null'] },
        },
        required: ['rawName', 'name', 'quantity', 'unit', 'lineTotal', 'weightValue', 'weightUnit', 'confidence'],
      },
    },
  },
  required: ['merchant', 'date', 'currency', 'total', 'items'],
} as const
