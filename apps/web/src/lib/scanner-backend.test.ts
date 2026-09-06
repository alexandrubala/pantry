import { expect, test } from 'vitest'
import { selectBarcodeScanner } from './scanner-backend'

test('uses native BarcodeDetector when retail formats are supported', async () => {
  const selection = await selectBarcodeScanner({
    getSupportedFormats: async () => ['qr_code', 'ean_13', 'upc_a'],
  })

  expect(selection).toEqual({
    backend: 'native',
    formats: ['ean_13', 'upc_a'],
  })
})

test('falls back to ZXing when BarcodeDetector is missing', async () => {
  await expect(selectBarcodeScanner(undefined)).resolves.toEqual({
    backend: 'zxing',
    formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'],
  })
})

test('falls back to ZXing when native formats are unusable', async () => {
  await expect(
    selectBarcodeScanner({
      getSupportedFormats: async () => ['qr_code', 'pdf417'],
    }),
  ).resolves.toMatchObject({ backend: 'zxing' })
})
