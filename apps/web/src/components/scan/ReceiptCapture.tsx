import { LoaderCircle } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { isPantryApiError } from '../../lib/api'
import { RECEIPT_IMAGE_TOO_LARGE_MESSAGE, prepareReceiptImage } from '../../lib/receipt-image'
import { RECEIPT_RATE_LIMIT_MESSAGE, mapPantryApiError } from '../../lib/pantry-api-error'
import { extractReceipt, type ReceiptExtractResponse } from '../../lib/pantry-api'

export function ReceiptCapture({
  onClose,
  onExtracted,
}: {
  onClose: () => void
  onExtracted: (draft: ReceiptExtractResponse['receipt']) => void
}) {
  const cameraInputId = useId()
  const galleryInputId = useId()
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [file, setFile] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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

  async function process() {
    if (!file || busy) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const prepared = await prepareReceiptImage(file)
      const result = await extractReceipt(prepared.blob, `receipt.${prepared.mimeType === 'image/webp' ? 'webp' : 'jpg'}`)
      onExtracted(result.receipt)
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message === RECEIPT_IMAGE_TOO_LARGE_MESSAGE
          ? RECEIPT_IMAGE_TOO_LARGE_MESSAGE
          : isPantryApiError(cause) && cause.code === 'AI_RATE_LIMIT'
            ? RECEIPT_RATE_LIMIT_MESSAGE
            : mapPantryApiError(cause),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Scanează bon</h1>
        <button type="button" className="text-sm text-muted" onClick={onClose}>
          Închide
        </button>
      </div>
      <p className="mt-2 text-sm text-muted">Fă o poză lizibilă sau alege o imagine din telefon. Imaginea nu se salvează.</p>

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

      <button
        type="button"
        className="mt-6 flex h-touch min-h-touch w-full items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground"
        onClick={() => cameraRef.current?.click()}
      >
        Fă o poză
      </button>
      <button
        type="button"
        className="mt-3 flex h-touch min-h-touch w-full items-center justify-center rounded-lg border border-border px-4 text-sm font-medium"
        onClick={() => galleryRef.current?.click()}
      >
        Alege din galerie
      </button>

      {previewUrl ? (
        <div className="mt-5">
          <img src={previewUrl} alt="Previzualizare bon" className="max-h-64 w-full rounded-xl object-contain bg-surface" />
          <button
            type="button"
            disabled={busy}
            className="mt-4 flex h-touch min-h-touch w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground disabled:opacity-60"
            onClick={() => void process()}
          >
            {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            {busy ? 'Se citește bonul...' : 'Procesează bonul'}
          </button>
        </div>
      ) : null}

      <div role="alert" className="mt-3 min-h-5 text-sm text-destructive">
        {error}
      </div>
    </div>
  )
}
