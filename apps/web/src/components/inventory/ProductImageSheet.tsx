import type { ProductRecord } from '@pantry/core'
import { LoaderCircle } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { deleteProductImage, uploadProductImage } from '../../lib/pantry-api'
import { mapPantryApiError } from '../../lib/pantry-api-error'
import {
  PRODUCT_IMAGE_TOO_LARGE_MESSAGE,
  prepareProductImage,
  productDisplayImageUrl,
  productHasVisibleImage,
} from '../../lib/product-image'
import { ProductImage } from '../scan/ProductImage'
import { InventorySheet } from './InventorySheet'

export function ProductImageSheet({
  product,
  onClose,
  onSaved,
}: {
  product: {
    id: string
    name: string
    imageUrl: string | null
    hasCustomImage: boolean
    customImageUpdatedAt: string | null
  }
  onClose: () => void
  onSaved: (product: ProductRecord) => Promise<void>
}) {
  const cameraInputId = useId()
  const galleryInputId = useId()
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [file, setFile] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const hasImage = productHasVisibleImage(product)
  const currentUrl = productDisplayImageUrl(product)
  const title = hasImage ? 'Schimbă poza' : 'Adaugă poză'

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  function handleFile(selected: File | undefined) {
    if (!selected) {
      return
    }

    setError(null)
    setFile(selected)
    setPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current)
      }
      return URL.createObjectURL(selected)
    })
  }

  function cancelSelection() {
    setFile(null)
    setPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current)
      }
      return null
    })
    setError(null)
    if (cameraRef.current) {
      cameraRef.current.value = ''
    }
    if (galleryRef.current) {
      galleryRef.current.value = ''
    }
  }

  async function save() {
    if (!file || busy) {
      return
    }

    setBusy(true)
    setError(null)
    try {
      const prepared = await prepareProductImage(file)
      const result = await uploadProductImage(product.id, prepared.blob, prepared.fileName)
      await onSaved(result.product)
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message === PRODUCT_IMAGE_TOO_LARGE_MESSAGE
          ? PRODUCT_IMAGE_TOO_LARGE_MESSAGE
          : mapPantryApiError(cause),
      )
    } finally {
      setBusy(false)
    }
  }

  async function removeCustom() {
    if (busy) {
      return
    }

    setBusy(true)
    setError(null)
    try {
      const result = await deleteProductImage(product.id)
      await onSaved(result.product)
    } catch (cause) {
      setError(mapPantryApiError(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <InventorySheet title={`${title} · ${product.name}`} onClose={onClose}>
      <input
        id={cameraInputId}
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => handleFile(event.target.files?.[0])}
      />
      <input
        id={galleryInputId}
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => handleFile(event.target.files?.[0])}
      />

      {previewUrl ? (
        <div>
          <img
            src={previewUrl}
            alt="Previzualizare poză produs"
            className="max-h-64 w-full rounded-xl bg-surface object-contain"
          />
          <div role="alert" aria-live="assertive" className="mt-3 min-h-5 text-sm text-destructive">
            {error}
          </div>
          <button
            type="button"
            disabled={busy}
            className="mt-3 flex h-touch min-h-touch w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground disabled:opacity-60"
            onClick={() => void save()}
          >
            {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            {busy ? 'Se salvează...' : 'Salvează poza'}
          </button>
          <button
            type="button"
            disabled={busy}
            className="mt-2 flex h-touch min-h-touch w-full items-center justify-center rounded-lg border border-border px-4 text-sm font-medium disabled:opacity-60"
            onClick={cancelSelection}
          >
            Anulează
          </button>
        </div>
      ) : (
        <div>
          {currentUrl ? (
            <ProductImage url={currentUrl} fallbackUrl={product.imageUrl} name={product.name} sizeClassName="size-28" />
          ) : (
            <ProductImage url={null} name={product.name} sizeClassName="size-28" />
          )}
          <button
            type="button"
            className="mt-4 flex h-touch min-h-touch w-full items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground"
            onClick={() => cameraRef.current?.click()}
          >
            Fă o poză
          </button>
          <button
            type="button"
            className="mt-2 flex h-touch min-h-touch w-full items-center justify-center rounded-lg border border-border px-4 text-sm font-medium"
            onClick={() => galleryRef.current?.click()}
          >
            Alege din galerie
          </button>
          {product.hasCustomImage ? (
            <button
              type="button"
              disabled={busy}
              className="mt-2 flex h-touch min-h-touch w-full items-center justify-center rounded-lg px-4 text-sm font-medium text-destructive disabled:opacity-60"
              onClick={() => void removeCustom()}
            >
              {product.imageUrl ? 'Revino la poza originală' : 'Elimină poza personalizată'}
            </button>
          ) : null}
          <div role="alert" aria-live="assertive" className="mt-3 min-h-5 text-sm text-destructive">
            {error}
          </div>
        </div>
      )}
    </InventorySheet>
  )
}
