import { expect, test } from 'vitest'
import {
  PRODUCT_IMAGE_CLIENT_MAX_BYTES,
  PRODUCT_IMAGE_TOO_LARGE_MESSAGE,
  prepareProductImage,
  productDisplayImageUrl,
  productHasVisibleImage,
} from './product-image'

test('custom household image wins over catalog URL', () => {
  expect(
    productDisplayImageUrl({
      id: 'p1',
      imageUrl: 'https://images.openfoodfacts.org/images/products/front.jpg',
      hasCustomImage: true,
      customImageUpdatedAt: '2026-09-08T12:00:00.000Z',
    }),
  ).toBe('/api/v1/products/p1/image?v=2026-09-08T12%3A00%3A00.000Z')
  expect(
    productDisplayImageUrl({
      id: 'p1',
      imageUrl: 'https://images.openfoodfacts.org/images/products/front.jpg',
      hasCustomImage: false,
      customImageUpdatedAt: null,
    }),
  ).toBe('https://images.openfoodfacts.org/images/products/front.jpg')
  expect(
    productDisplayImageUrl({
      id: 'p1',
      imageUrl: null,
      hasCustomImage: false,
      customImageUpdatedAt: null,
    }),
  ).toBeNull()
  expect(productHasVisibleImage({ imageUrl: null, hasCustomImage: false })).toBe(false)
  expect(productHasVisibleImage({ imageUrl: 'https://example.invalid/a.jpg', hasCustomImage: false })).toBe(true)
})

test('rejects oversized originals when bitmap APIs are unavailable', async () => {
  const original = globalThis.createImageBitmap
  // @ts-expect-error test override
  globalThis.createImageBitmap = undefined
  const huge = new Blob([new Uint8Array(PRODUCT_IMAGE_CLIENT_MAX_BYTES + 1)], { type: 'image/jpeg' })
  await expect(prepareProductImage(huge)).rejects.toThrow(PRODUCT_IMAGE_TOO_LARGE_MESSAGE)
  globalThis.createImageBitmap = original
})
