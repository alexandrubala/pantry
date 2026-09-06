export const RECEIPT_CLIENT_MAX_BYTES = 2_000_000
export const RECEIPT_LONG_EDGE = 1800
export const RECEIPT_IMAGE_TOO_LARGE_MESSAGE =
  'Imaginea e prea mare. Fă o poză mai apropiată sau alege o imagine mai mică.'

export type PreparedReceiptImage = {
  blob: Blob
  mimeType: 'image/jpeg' | 'image/webp'
}

function canUseWebp(canvas: HTMLCanvasElement): boolean {
  try {
    return canvas.toDataURL('image/webp').startsWith('data:image/webp')
  } catch {
    return false
  }
}

export async function prepareReceiptImage(file: Blob): Promise<PreparedReceiptImage> {
  if (typeof createImageBitmap !== 'function') {
    if (file.size > RECEIPT_CLIENT_MAX_BYTES) {
      throw new Error(RECEIPT_IMAGE_TOO_LARGE_MESSAGE)
    }
    const mimeType = file.type === 'image/webp' ? 'image/webp' : 'image/jpeg'
    return { blob: file, mimeType }
  }

  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const maxEdge = Math.max(bitmap.width, bitmap.height)
  const scale = maxEdge > RECEIPT_LONG_EDGE ? RECEIPT_LONG_EDGE / maxEdge : 1
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error(RECEIPT_IMAGE_TOO_LARGE_MESSAGE)
  }
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const mimeType = canUseWebp(canvas) ? 'image/webp' : 'image/jpeg'
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), mimeType, 0.82)
  })
  if (!blob || blob.size > RECEIPT_CLIENT_MAX_BYTES) {
    throw new Error(RECEIPT_IMAGE_TOO_LARGE_MESSAGE)
  }
  return { blob, mimeType }
}
