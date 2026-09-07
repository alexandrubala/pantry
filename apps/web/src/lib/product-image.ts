export const PRODUCT_IMAGE_CLIENT_MAX_BYTES = 2_000_000
export const PRODUCT_IMAGE_LONG_EDGE = 1600
export const PRODUCT_IMAGE_TOO_LARGE_MESSAGE =
  'Imaginea e prea mare. Fă o poză mai apropiată sau alege o imagine mai mică.'

export type PreparedProductImage = {
  blob: Blob
  mimeType: 'image/jpeg' | 'image/webp'
  fileName: string
}

export type ProductDisplayImage = {
  id: string
  imageUrl: string | null
  hasCustomImage: boolean
  customImageUpdatedAt: string | null
}

export function productDisplayImageUrl(product: ProductDisplayImage): string | null {
  if (product.hasCustomImage) {
    const version = product.customImageUpdatedAt
      ? `?v=${encodeURIComponent(product.customImageUpdatedAt)}`
      : ''
    return `/api/v1/products/${encodeURIComponent(product.id)}/image${version}`
  }

  return product.imageUrl
}

export function productHasVisibleImage(product: Pick<ProductDisplayImage, 'imageUrl' | 'hasCustomImage'>): boolean {
  return product.hasCustomImage || Boolean(product.imageUrl)
}

function canUseWebp(canvas: HTMLCanvasElement): boolean {
  try {
    return canvas.toDataURL('image/webp').startsWith('data:image/webp')
  } catch {
    return false
  }
}

async function canvasToBlob(canvas: HTMLCanvasElement, mimeType: 'image/jpeg' | 'image/webp', quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), mimeType, quality)
  })
}

export async function prepareProductImage(file: Blob): Promise<PreparedProductImage> {
  if (typeof createImageBitmap !== 'function') {
    if (file.size > PRODUCT_IMAGE_CLIENT_MAX_BYTES) {
      throw new Error(PRODUCT_IMAGE_TOO_LARGE_MESSAGE)
    }
    const mimeType = file.type === 'image/webp' ? 'image/webp' : 'image/jpeg'
    return { blob: file, mimeType, fileName: mimeType === 'image/webp' ? 'product.webp' : 'product.jpg' }
  }

  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const maxEdge = Math.max(bitmap.width, bitmap.height)
  const scale = maxEdge > PRODUCT_IMAGE_LONG_EDGE ? PRODUCT_IMAGE_LONG_EDGE / maxEdge : 1
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error(PRODUCT_IMAGE_TOO_LARGE_MESSAGE)
  }
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const mimeType = canUseWebp(canvas) ? 'image/webp' : 'image/jpeg'
  let quality = 0.88
  let blob = await canvasToBlob(canvas, mimeType, quality)
  while (blob && blob.size > PRODUCT_IMAGE_CLIENT_MAX_BYTES && quality > 0.8) {
    quality -= 0.04
    blob = await canvasToBlob(canvas, mimeType, quality)
  }

  if (!blob || blob.size > PRODUCT_IMAGE_CLIENT_MAX_BYTES) {
    throw new Error(PRODUCT_IMAGE_TOO_LARGE_MESSAGE)
  }

  return {
    blob,
    mimeType,
    fileName: mimeType === 'image/webp' ? 'product.webp' : 'product.jpg',
  }
}
