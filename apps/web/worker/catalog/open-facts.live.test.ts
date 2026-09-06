import { expect, test } from 'vitest'
import { createOpenFactsCatalog } from './open-facts.js'

const LIVE = process.env.RUN_LIVE_OFF === '1'

test.skipIf(!LIVE)('looks up a documented Open Food Facts example barcode', async () => {
  const catalog = createOpenFactsCatalog()
  const result = await catalog.lookupByBarcode('3017620422003')
  expect(result.status).toBe('found')
  if (result.status !== 'found') {
    return
  }

  expect(result.product.catalog).toBe('open_food_facts')
  expect(result.product.name).toMatch(/nutella/i)
  expect(result.product.brand).toBeTruthy()
  expect(result.product.nutrition?.energyKcal100g).toBe(539)
  expect(result.product.nutrition?.proteinG100g).toBe(6.3)
  expect(result.product.nutrition?.carbohydratesG100g).toBe(57.5)
  expect(result.product.nutrition?.fatG100g).toBe(30.9)
})
