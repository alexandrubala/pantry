import { beforeEach, expect, test, vi } from 'vitest'
import { PRODUCT_MAX_IMAGE_BYTES } from '@pantry/core'

vi.mock('../auth/session.js', () => ({
  resolveCurrentUser: vi.fn(),
}))

import { resolveCurrentUser } from '../auth/session.js'
import { app } from '../index'
import { replaceHouseholdProductImage } from '../product-images.js'
import { memoryR2 } from '../test/memory-r2'
import { envWithDb, insertProfile, insertUser, openPantryDb } from '../test/sqlite-d1'
import type { ProductStore } from '@pantry/core'

const resolveCurrentUserMock = vi.mocked(resolveCurrentUser)

const TINY_JPEG = Uint8Array.from(
  atob(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGf/9k=',
  ),
  (char) => char.charCodeAt(0),
)

const TINY_PNG = Uint8Array.of(
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
)

const TINY_WEBP = Uint8Array.of(
  0x52, 0x49, 0x46, 0x46, 0x18, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
)

beforeEach(() => {
  resolveCurrentUserMock.mockReset()
  resolveCurrentUserMock.mockResolvedValue(null)
})

async function createHousehold(db: ReturnType<typeof openPantryDb>, userId: string, name: string) {
  resolveCurrentUserMock.mockResolvedValue({ id: userId, name: userId })
  const res = await app.request(
    '/api/v1/households',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    },
    envWithDb(db),
  )
  expect(res.status).toBe(201)
  return (await res.json()) as { household: { id: string } }
}

async function createProduct(env: ReturnType<typeof envWithDb>, name = 'Ouă') {
  const created = await app.request(
    '/api/v1/products',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, unit: 'each' }),
    },
    env,
  )
  expect(created.status).toBe(201)
  return (await created.json()) as { product: { id: string; imageUrl: string | null; hasCustomImage: boolean } }
}

function imageForm(bytes: Uint8Array, type: string, name = 'photo.jpg') {
  const form = new FormData()
  form.append('image', new File([bytes], name, { type }))
  return form
}

function insertGlobalCatalogProduct(db: ReturnType<typeof openPantryDb>, id = 'off-penne') {
  db.prepare(
    `INSERT INTO products (
       id, household_id, barcode, name, normalized_name, brand, default_unit, source, image_url, created_at, updated_at
     ) VALUES (?, NULL, ?, 'Barilla Penne', 'barilla penne', 'Barilla', 'g', 'open_food_facts', ?, datetime('now'), datetime('now'))`,
  ).run(id, '8076809580777', 'https://images.openfoodfacts.org/images/products/barilla.jpg')
  return id
}

test('product image routes require auth and an active household', async () => {
  const db = openPantryDb()
  const env = envWithDb(db)
  expect((await app.request('/api/v1/products/p1/image', { method: 'PUT', body: imageForm(TINY_JPEG, 'image/jpeg') }, env)).status).toBe(401)
  expect((await app.request('/api/v1/products/p1/image', {}, env)).status).toBe(401)
  expect((await app.request('/api/v1/products/p1/image', { method: 'DELETE' }, env)).status).toBe(401)

  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  resolveCurrentUserMock.mockResolvedValue({ id: 'user-1', name: 'Alex' })
  expect((await app.request('/api/v1/products/p1/image', {}, env)).status).toBe(409)
})

test('household A custom image is private and does not change catalog image_url', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-a', 'A', 'a@example.invalid')
  insertUser(db, 'user-b', 'B', 'b@example.invalid')
  insertProfile(db, 'user-a', 'A')
  insertProfile(db, 'user-b', 'B')
  const householdA = await createHousehold(db, 'user-a', 'Casa A')
  await createHousehold(db, 'user-b', 'Casa B')
  const productId = insertGlobalCatalogProduct(db)
  const r2 = memoryR2()
  const env = envWithDb(db, undefined, r2)

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-a', name: 'A' })
  const uploaded = await app.request(
    `/api/v1/products/${productId}/image`,
    { method: 'PUT', body: imageForm(TINY_JPEG, 'image/jpeg') },
    env,
  )
  expect(uploaded.status).toBe(200)
  const uploadedBody = await uploaded.json()
  expect(uploadedBody.product).toMatchObject({
    imageUrl: 'https://images.openfoodfacts.org/images/products/barilla.jpg',
    hasCustomImage: true,
  })
  expect(uploadedBody.product.customImageUpdatedAt).toEqual(expect.any(String))
  expect(JSON.stringify(uploadedBody)).not.toMatch(/r2_key|r2Key|households\//)
  expect(db.prepare('SELECT image_url FROM products WHERE id = ?').get(productId)).toEqual({
    image_url: 'https://images.openfoodfacts.org/images/products/barilla.jpg',
  })

  const servedA = await app.request(
    `/api/v1/products/${productId}/image?v=${encodeURIComponent(uploadedBody.product.customImageUpdatedAt)}`,
    {},
    env,
  )
  expect(servedA.status).toBe(200)
  expect(servedA.headers.get('content-type')).toBe('image/jpeg')
  expect(servedA.headers.get('cache-control')).toBe('private, no-store')
  expect(new Uint8Array(await servedA.arrayBuffer())).toEqual(TINY_JPEG)

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-b', name: 'B' })
  const listedB = await app.request('/api/v1/products', {}, env)
  const listedBody = await listedB.json()
  const productB = listedBody.products.find((item: { id: string }) => item.id === productId)
  expect(productB).toMatchObject({
    imageUrl: 'https://images.openfoodfacts.org/images/products/barilla.jpg',
    hasCustomImage: false,
    customImageUpdatedAt: null,
  })
  expect((await app.request(`/api/v1/products/${productId}/image`, {}, env)).status).toBe(404)

  resolveCurrentUserMock.mockResolvedValue({ id: 'user-a', name: 'A' })
  const privateProduct = await createProduct(env, 'Secret A')
  resolveCurrentUserMock.mockResolvedValue({ id: 'user-b', name: 'B' })
  expect(
    (await app.request(`/api/v1/products/${privateProduct.product.id}/image`, {}, env)).status,
  ).toBe(404)
  expect(
    (
      await app.request(
        `/api/v1/products/${privateProduct.product.id}/image`,
        { method: 'PUT', body: imageForm(TINY_JPEG, 'image/jpeg') },
        env,
      )
    ).status,
  ).toBe(404)

  db.prepare(
    `INSERT INTO household_members (household_id, user_id, role, created_at)
     VALUES (?, 'user-b', 'member', datetime('now'))`,
  ).run(householdA.household.id)
  db.prepare(`UPDATE profiles SET active_household_id = ? WHERE id = 'user-b'`).run(householdA.household.id)
  resolveCurrentUserMock.mockResolvedValue({ id: 'user-b', name: 'B' })
  const memberUpload = await app.request(
    `/api/v1/products/${productId}/image`,
    { method: 'PUT', body: imageForm(TINY_PNG, 'image/png', 'photo.png') },
    env,
  )
  expect(memberUpload.status).toBe(200)
  expect((await memberUpload.json()).product.hasCustomImage).toBe(true)
})

test('replacing a custom image points D1 at the new object and deletes the old one', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')
  const r2 = memoryR2()
  const env = envWithDb(db, undefined, r2)
  resolveCurrentUserMock.mockResolvedValue({ id: 'user-1', name: 'Alex' })
  const created = await createProduct(env)

  const first = await app.request(
    `/api/v1/products/${created.product.id}/image`,
    { method: 'PUT', body: imageForm(TINY_JPEG, 'image/jpeg') },
    env,
  )
  expect(first.status).toBe(200)
  expect(r2.objects.size).toBe(1)
  const firstKey = [...r2.objects.keys()][0] ?? ''

  const second = await app.request(
    `/api/v1/products/${created.product.id}/image`,
    { method: 'PUT', body: imageForm(TINY_WEBP, 'image/webp', 'photo.webp') },
    env,
  )
  expect(second.status).toBe(200)
  expect(r2.objects.size).toBe(1)
  const secondKey = [...r2.objects.keys()][0] ?? ''
  expect(secondKey).not.toBe(firstKey)
  expect(r2.objects.get(secondKey)?.bytes).toEqual(TINY_WEBP)

  const served = await app.request(`/api/v1/products/${created.product.id}/image`, {}, env)
  expect(new Uint8Array(await served.arrayBuffer())).toEqual(TINY_WEBP)
  expect(
    db.prepare('SELECT r2_key FROM household_product_images WHERE product_id = ?').get(created.product.id),
  ).toEqual({ r2_key: secondKey })
})

test('D1 upsert failure deletes the new R2 object and keeps the old override', async () => {
  const r2 = memoryR2()
  const oldKey = 'households/h1/products/p1/old.webp'
  await r2.put(oldKey, TINY_WEBP, { httpMetadata: { contentType: 'image/webp' } })

  const products = {
    async getReadableProduct() {
      return {
        id: 'p1',
        name: 'Ouă',
        brand: null,
        unit: 'each',
        barcode: null,
        imageUrl: null,
        hasCustomImage: true,
        customImageUpdatedAt: '2026-09-08T00:00:00.000Z',
        source: 'manual',
        externalCatalog: null,
        externalProductType: null,
        packageQuantity: null,
        packageUnit: null,
        nutrition: null,
      }
    },
    async getHouseholdProductImage() {
      return {
        r2Key: oldKey,
        contentType: 'image/webp',
        createdByUserId: 'user-1',
        createdAt: '2026-09-08T00:00:00.000Z',
        updatedAt: '2026-09-08T00:00:00.000Z',
      }
    },
    async upsertHouseholdProductImage() {
      throw new Error('d1 failed')
    },
  } as unknown as ProductStore

  await expect(
    replaceHouseholdProductImage({
      r2,
      products,
      householdId: 'h1',
      productId: 'p1',
      userId: 'user-1',
      bytes: TINY_JPEG,
      contentType: 'image/jpeg',
    }),
  ).rejects.toThrow('d1 failed')

  expect(r2.objects.has(oldKey)).toBe(true)
  expect([...r2.objects.keys()]).toEqual([oldKey])
})

test('removing a custom image restores catalog or placeholder without deleting catalog URL', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')
  const r2 = memoryR2()
  const env = envWithDb(db, undefined, r2)
  resolveCurrentUserMock.mockResolvedValue({ id: 'user-1', name: 'Alex' })

  const catalogId = insertGlobalCatalogProduct(db)
  await app.request(
    `/api/v1/products/${catalogId}/image`,
    { method: 'PUT', body: imageForm(TINY_JPEG, 'image/jpeg') },
    env,
  )
  const removedCatalog = await app.request(`/api/v1/products/${catalogId}/image`, { method: 'DELETE' }, env)
  expect(removedCatalog.status).toBe(200)
  const removedCatalogBody = await removedCatalog.json()
  expect(removedCatalogBody.product).toMatchObject({
    hasCustomImage: false,
    customImageUpdatedAt: null,
    imageUrl: 'https://images.openfoodfacts.org/images/products/barilla.jpg',
  })
  expect(db.prepare('SELECT image_url FROM products WHERE id = ?').get(catalogId)).toEqual({
    image_url: 'https://images.openfoodfacts.org/images/products/barilla.jpg',
  })
  expect(r2.objects.size).toBe(0)

  const manual = await createProduct(env)
  await app.request(
    `/api/v1/products/${manual.product.id}/image`,
    { method: 'PUT', body: imageForm(TINY_PNG, 'image/png', 'photo.png') },
    env,
  )
  const removedManual = await app.request(`/api/v1/products/${manual.product.id}/image`, { method: 'DELETE' }, env)
  const removedManualBody = await removedManual.json()
  expect(removedManualBody.product).toMatchObject({
    hasCustomImage: false,
    imageUrl: null,
  })
})

test('accepts jpeg png webp and rejects svg empty oversized and fake signatures', async () => {
  const db = openPantryDb()
  insertUser(db, 'user-1', 'Alex', 'alex@example.invalid')
  insertProfile(db, 'user-1', 'Alex')
  await createHousehold(db, 'user-1', 'Casa mea')
  const env = envWithDb(db)
  resolveCurrentUserMock.mockResolvedValue({ id: 'user-1', name: 'Alex' })
  const created = await createProduct(env)
  const path = `/api/v1/products/${created.product.id}/image`

  expect((await app.request(path, { method: 'PUT', body: imageForm(TINY_JPEG, 'image/jpeg') }, env)).status).toBe(200)
  expect(
    (await app.request(path, { method: 'PUT', body: imageForm(TINY_PNG, 'image/png', 'photo.png') }, env)).status,
  ).toBe(200)
  expect(
    (await app.request(path, { method: 'PUT', body: imageForm(TINY_WEBP, 'image/webp', 'photo.webp') }, env)).status,
  ).toBe(200)

  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
  expect(
    (await app.request(path, { method: 'PUT', body: imageForm(svg, 'image/svg+xml', 'photo.svg') }, env)).status,
  ).toBe(400)
  expect(
    (await app.request(path, { method: 'PUT', body: imageForm(new Uint8Array(), 'image/jpeg') }, env)).status,
  ).toBe(400)
  expect(
    (
      await app.request(
        path,
        { method: 'PUT', body: imageForm(new Uint8Array(PRODUCT_MAX_IMAGE_BYTES + 1), 'image/jpeg') },
        env,
      )
    ).status,
  ).toBe(400)
  expect(
    (await app.request(path, { method: 'PUT', body: imageForm(TINY_PNG, 'image/jpeg') }, env)).status,
  ).toBe(400)
  expect(
    (await app.request(path, { method: 'PUT', body: imageForm(svg, 'image/jpeg') }, env)).status,
  ).toBe(400)
})
