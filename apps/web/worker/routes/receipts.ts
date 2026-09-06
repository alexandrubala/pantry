import { Hono } from 'hono'
import {
  DomainError,
  RECEIPT_MAX_IMAGE_BYTES,
  annotateReceiptDraft,
  httpStatusForDomainError,
  isDomainError,
  parseReceiptDraft,
  type HouseholdStore,
  type ProductStore,
  type ReceiptStore,
  type ReceiptVisionProvider,
} from '@pantry/core'
import { createD1HouseholdStore, createD1ProductStore, createD1ReceiptStore } from '@pantry/database/d1'
import { requireAuth } from '../auth/authorize.js'
import { ensureProfile } from '../profiles/profile.js'
import { createWorkersAiReceiptProvider } from '../ai/receipt-provider.js'

export const receipts = new Hono<{ Bindings: CloudflareBindings }>()

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])

function householdStore(db: D1Database): HouseholdStore {
  return createD1HouseholdStore(db)
}

function productStore(db: D1Database): ProductStore {
  return createD1ProductStore(db)
}

function receiptStore(db: D1Database): ReceiptStore {
  return createD1ReceiptStore(db)
}

function domainResponse(error: DomainError) {
  if (error.code === 'AI_RATE_LIMIT') {
    return {
      body: { error: 'AI_RATE_LIMIT', retryAfter: error.retryAfter ?? 1 },
      status: 429 as const,
    }
  }

  return {
    body: {
      error:
        error.code === 'RECEIPT_NO_ITEMS' ||
        error.code === 'RECEIPT_EXTRACTION_FAILED' ||
        error.code === 'RECEIPT_IMAGE_INVALID' ||
        error.code === 'RECEIPT_IMAGE_TOO_LARGE' ||
        error.code === 'AI_UNAVAILABLE'
          ? error.code
          : error.message,
      code: error.code,
      ...(error.retryAfter != null ? { retryAfter: error.retryAfter } : {}),
    },
    status: httpStatusForDomainError(error.code),
  }
}

function bytesToDataUri(bytes: Uint8Array, mimeType: string): string {
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return `data:${mimeType};base64,${btoa(binary)}`
}

async function readReceiptImage(request: Request): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const contentType = request.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData()
    const image = form.get('image')
    if (typeof image === 'string' || !image || typeof image.arrayBuffer !== 'function') {
      throw new DomainError('RECEIPT_IMAGE_INVALID', 'RECEIPT_IMAGE_INVALID')
    }
    const mimeType = (image.type || 'image/jpeg').toLowerCase()
    if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
      throw new DomainError('RECEIPT_IMAGE_INVALID', 'RECEIPT_IMAGE_INVALID')
    }
    const buffer = new Uint8Array(await image.arrayBuffer())
    return { bytes: buffer, mimeType: mimeType === 'image/jpg' ? 'image/jpeg' : mimeType }
  }

  throw new DomainError('RECEIPT_IMAGE_INVALID', 'RECEIPT_IMAGE_INVALID')
}

receipts.post('/receipts/extract', async (c) => {
  const user = await requireAuth(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await ensureProfile(c.env.DB, user)

  let imageDataUri: string | null = null
  try {
    const households = householdStore(c.env.DB)
    const household = await households.getActiveHousehold(user.id)
    if (!household) {
      throw new DomainError('HOUSEHOLD_REQUIRED', 'Household setup required')
    }

    const reservation = await receiptStore(c.env.DB).reserveReceiptExtraction({ userId: user.id })
    if (!reservation.ok) {
      throw new DomainError('AI_RATE_LIMIT', 'AI_RATE_LIMIT', { retryAfter: reservation.retryAfter })
    }

    const image = await readReceiptImage(c.req.raw)
    if (image.bytes.byteLength === 0 || image.bytes.byteLength > RECEIPT_MAX_IMAGE_BYTES) {
      throw new DomainError('RECEIPT_IMAGE_TOO_LARGE', 'RECEIPT_IMAGE_TOO_LARGE')
    }

    const model: string = c.env.RECEIPT_AI_MODEL
    if (!model || !c.env.AI) {
      throw new DomainError('AI_UNAVAILABLE', 'AI_UNAVAILABLE')
    }

    imageDataUri = bytesToDataUri(image.bytes, image.mimeType)
    const provider: ReceiptVisionProvider = createWorkersAiReceiptProvider(c.env.AI, model)
    const raw = await provider.extractReceipt({ imageDataUri })
    imageDataUri = null

    const draft = parseReceiptDraft(raw)
    const products = await productStore(c.env.DB).listProducts({ householdId: household.id })
    const lines = annotateReceiptDraft(
      draft,
      products.map((product) => ({
        id: product.id,
        name: product.name,
        brand: product.brand,
        unit: product.unit,
        packageQuantity: product.packageQuantity,
        packageUnit: product.packageUnit,
      })),
    )

    return c.json({
      receipt: {
        merchant: draft.merchant,
        date: draft.date,
        currency: draft.currency,
        total: draft.total,
        items: lines,
      },
    })
  } catch (error) {
    imageDataUri = null
    if (isDomainError(error)) {
      const mapped = domainResponse(error)
      return c.json(mapped.body, mapped.status)
    }
    throw error
  }
})
