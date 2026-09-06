import { expect, test } from 'vitest'
import { createOpenFactsCatalog, OPEN_FOOD_FACTS_ORIGIN, OPEN_PRODUCTS_FACTS_ORIGIN, OPEN_FACTS_USER_AGENT } from './open-facts.js'

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

test('queries Open Food Facts then Open Products Facts on genuine not-found', async () => {
  const calls: string[] = []
  const catalog = createOpenFactsCatalog({
    fetch: async (url) => {
      calls.push(url)
      if (url.startsWith(OPEN_FOOD_FACTS_ORIGIN)) {
        return jsonResponse(404, { status: 'failure', result: { id: 'product_not_found' } })
      }
      return jsonResponse(200, {
        status: 'success',
        product: { product_name: 'Sponge', product_type: 'product', brands: 'Spontex' },
      })
    },
  })

  const result = await catalog.lookupByBarcode('3560070472884')
  expect(result.status).toBe('found')
  if (result.status === 'found') {
    expect(result.product.catalog).toBe('open_products_facts')
    expect(result.product.name).toBe('Sponge')
  }
  expect(calls[0]).toContain(OPEN_FOOD_FACTS_ORIGIN)
  expect(calls[1]).toContain(OPEN_PRODUCTS_FACTS_ORIGIN)
  expect(calls[0]).toContain('3560070472884')
})

test('does not treat Open Food Facts downtime as not found', async () => {
  const catalog = createOpenFactsCatalog({
    fetch: async () => jsonResponse(503, { error: 'unavailable' }),
  })

  await expect(catalog.lookupByBarcode('3017620422003')).resolves.toEqual({ status: 'temporary_failure' })
})

test('returns not_found only after both catalogs 404', async () => {
  const catalog = createOpenFactsCatalog({
    fetch: async () => jsonResponse(404, { status: 'failure' }),
  })

  await expect(catalog.lookupByBarcode('0000000000000')).resolves.toEqual({ status: 'not_found' })
})

test('sends the Pantry User-Agent and never follows untrusted redirects', async () => {
  const headers: Array<Record<string, string> | undefined> = []
  const catalog = createOpenFactsCatalog({
    fetch: async (_url, init) => {
      headers.push(init?.headers)
      expect(init?.redirect).toBe('manual')
      return new Response(null, {
        status: 302,
        headers: { Location: 'https://evil.example/steal' },
      })
    },
  })

  const result = await catalog.lookupByBarcode('3017620422003')
  expect(result.status).toBe('not_found')
  expect(headers[0]?.['User-Agent']).toBe(OPEN_FACTS_USER_AGENT)
})

test('aborted or network failures are temporary', async () => {
  const catalog = createOpenFactsCatalog({
    fetch: async () => {
      throw new Error('network down')
    },
  })

  await expect(catalog.lookupByBarcode('3017620422003')).resolves.toEqual({ status: 'temporary_failure' })
})
