export const RETAIL_BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const
export const OPTIONAL_BARCODE_FORMATS = ['code_128'] as const
export const PREFERRED_BARCODE_FORMATS = [...RETAIL_BARCODE_FORMATS, ...OPTIONAL_BARCODE_FORMATS]

export type ScannerBackend = 'native' | 'zxing'

export type ScannerSelection = {
  backend: ScannerBackend
  formats: string[]
}

export type BarcodeDetectorLikeCtor = {
  getSupportedFormats?: () => Promise<string[]>
}

export async function selectBarcodeScanner(
  BarcodeDetectorCtor?: BarcodeDetectorLikeCtor | null,
): Promise<ScannerSelection> {
  if (!BarcodeDetectorCtor) {
    return { backend: 'zxing', formats: [...PREFERRED_BARCODE_FORMATS] }
  }

  if (typeof BarcodeDetectorCtor.getSupportedFormats !== 'function') {
    return { backend: 'native', formats: [...PREFERRED_BARCODE_FORMATS] }
  }

  try {
    const supported = await BarcodeDetectorCtor.getSupportedFormats()
    const formats = PREFERRED_BARCODE_FORMATS.filter((format) => supported.includes(format))
    if (formats.length === 0) {
      return { backend: 'zxing', formats: [...PREFERRED_BARCODE_FORMATS] }
    }

    return { backend: 'native', formats }
  } catch {
    return { backend: 'zxing', formats: [...PREFERRED_BARCODE_FORMATS] }
  }
}
