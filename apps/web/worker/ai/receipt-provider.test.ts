import { expect, test } from 'vitest'
import { parseWorkersAiReceiptResponse } from './receipt-provider'

test('parses structured receipt responses from Workers AI wrappers', () => {
  expect(
    parseWorkersAiReceiptResponse({
      response: { merchant: 'Lidl', items: [{ rawName: 'LAPTE', name: 'Lapte' }] },
    }),
  ).toMatchObject({ merchant: 'Lidl' })
  expect(
    parseWorkersAiReceiptResponse({
      choices: [{ message: { content: '{"merchant":"Lidl","items":[]}' } }],
    }),
  ).toMatchObject({ merchant: 'Lidl' })
})
