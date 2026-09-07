import {
  DomainError,
  inspectProductImage,
  PRODUCT_MAX_IMAGE_BYTES,
  type ProductImageContentType,
  type ProductRecord,
  type ProductStore,
} from '@pantry/core'

const ID_PATTERN = /^[A-Za-z0-9_-]+$/

function requireSafeId(value: string): string {
  if (!ID_PATTERN.test(value)) {
    throw new DomainError('NOT_FOUND', 'Not found')
  }

  return value
}

function extensionFor(contentType: ProductImageContentType): 'jpg' | 'png' | 'webp' {
  if (contentType === 'image/jpeg') {
    return 'jpg'
  }

  if (contentType === 'image/png') {
    return 'png'
  }

  return 'webp'
}

export function productImageR2Key(
  householdId: string,
  productId: string,
  contentType: ProductImageContentType,
): string {
  return `households/${requireSafeId(householdId)}/products/${requireSafeId(productId)}/${crypto.randomUUID()}.${extensionFor(contentType)}`
}

export async function bestEffortDeleteR2Object(r2: R2Bucket, key: string | null | undefined): Promise<void> {
  if (!key) {
    return
  }

  try {
    await r2.delete(key)
  } catch {
    // Orphan R2 objects are acceptable. Never fail the user-visible change for cleanup.
  }
}

async function requireReadableProduct(products: ProductStore, householdId: string, productId: string): Promise<ProductRecord> {
  const product = await products.getReadableProduct({ householdId, productId })
  if (!product) {
    throw new DomainError('NOT_FOUND', 'Not found')
  }

  return product
}

/**
 * R2 and D1 are not one transaction. Replacement order:
 * 1. upload the NEW object
 * 2. update D1 to the new key
 * 3. best-effort delete the OLD object
 * If D1 fails after the upload, best-effort delete the new object and keep the old override.
 * Never delete the old object before D1 succeeds.
 */
export async function replaceHouseholdProductImage(input: {
  r2: R2Bucket
  products: ProductStore
  householdId: string
  productId: string
  userId: string
  bytes: Uint8Array
  contentType: ProductImageContentType
}): Promise<ProductRecord> {
  const householdId = requireSafeId(input.householdId)
  const productId = requireSafeId(input.productId)
  await requireReadableProduct(input.products, householdId, productId)
  const previous = await input.products.getHouseholdProductImage({ householdId, productId })
  const nextKey = productImageR2Key(householdId, productId, input.contentType)

  await input.r2.put(nextKey, input.bytes, {
    httpMetadata: { contentType: input.contentType },
  })

  try {
    await input.products.upsertHouseholdProductImage({
      householdId,
      productId,
      r2Key: nextKey,
      contentType: input.contentType,
      createdByUserId: input.userId,
    })
  } catch (error) {
    await bestEffortDeleteR2Object(input.r2, nextKey)
    throw error
  }

  if (previous && previous.r2Key !== nextKey) {
    await bestEffortDeleteR2Object(input.r2, previous.r2Key)
  }

  const product = await input.products.getReadableProduct({ householdId, productId })
  if (!product) {
    throw new DomainError('NOT_FOUND', 'Not found')
  }

  return product
}

/**
 * Clear the household override in D1 first, then best-effort delete the R2 object.
 * A failed R2 delete may leave an orphan that is no longer reachable through Pantry.
 */
export async function removeHouseholdProductImage(input: {
  r2: R2Bucket
  products: ProductStore
  householdId: string
  productId: string
}): Promise<ProductRecord> {
  const householdId = requireSafeId(input.householdId)
  const productId = requireSafeId(input.productId)
  await requireReadableProduct(input.products, householdId, productId)
  const previous = await input.products.deleteHouseholdProductImage({ householdId, productId })
  if (previous) {
    await bestEffortDeleteR2Object(input.r2, previous.r2Key)
  }

  const product = await input.products.getReadableProduct({ householdId, productId })
  if (!product) {
    throw new DomainError('NOT_FOUND', 'Not found')
  }

  return product
}

export async function readUploadedProductImage(request: Request): Promise<{
  bytes: Uint8Array
  contentType: ProductImageContentType
}> {
  const headerLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(headerLength) && headerLength > PRODUCT_MAX_IMAGE_BYTES + 65_536) {
    throw new DomainError('PRODUCT_IMAGE_TOO_LARGE', 'PRODUCT_IMAGE_TOO_LARGE')
  }

  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    throw new DomainError('PRODUCT_IMAGE_INVALID', 'PRODUCT_IMAGE_INVALID')
  }

  const form = await request.formData()
  const image = form.get('image')
  if (typeof image === 'string' || !image || typeof image.arrayBuffer !== 'function') {
    throw new DomainError('PRODUCT_IMAGE_INVALID', 'PRODUCT_IMAGE_INVALID')
  }

  const bytes = new Uint8Array(await image.arrayBuffer())
  const inspected = inspectProductImage(bytes, image.type || null)
  return { bytes: inspected.bytes, contentType: inspected.contentType }
}

export async function serveHouseholdProductImage(input: {
  r2: R2Bucket
  products: ProductStore
  householdId: string
  productId: string
}): Promise<Response> {
  const householdId = requireSafeId(input.householdId)
  const productId = requireSafeId(input.productId)
  await requireReadableProduct(input.products, householdId, productId)
  const image = await input.products.getHouseholdProductImage({ householdId, productId })
  if (!image) {
    return new Response(null, { status: 404 })
  }

  const object = await input.r2.get(image.r2Key)
  if (!object) {
    return new Response(null, { status: 404 })
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': image.contentType,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
