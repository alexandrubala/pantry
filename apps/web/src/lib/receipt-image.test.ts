import { expect, test } from 'vitest'
import { RECEIPT_CLIENT_MAX_BYTES, RECEIPT_IMAGE_TOO_LARGE_MESSAGE, prepareReceiptImage } from './receipt-image'

test('rejects oversized originals when bitmap APIs are unavailable', async () => {
  const original = globalThis.createImageBitmap
  // @ts-expect-error test override
  globalThis.createImageBitmap = undefined
  const huge = new Blob([new Uint8Array(RECEIPT_CLIENT_MAX_BYTES + 1)], { type: 'image/jpeg' })
  await expect(prepareReceiptImage(huge)).rejects.toThrow(RECEIPT_IMAGE_TOO_LARGE_MESSAGE)
  globalThis.createImageBitmap = original
})
