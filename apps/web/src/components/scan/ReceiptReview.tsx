import {
  validateProductName,
  validateQuantity,
  type LocationRecord,
  type ProductRecord,
  type Unit,
} from '@pantry/core'
import { LoaderCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { unitLabel } from '../../lib/inventory-format'
import { mapPantryApiError } from '../../lib/pantry-api-error'
import {
  addStock,
  createProduct,
  type ReceiptDraftLineView,
  type ReceiptExtractResponse,
} from '../../lib/pantry-api'

const fieldClassName =
  'mt-1.5 h-touch min-h-touch w-full rounded-lg border border-border bg-surface px-3 text-text shadow-surface'

const UNIT_OPTIONS: Array<{ value: Unit; label: string }> = [
  { value: 'g', label: 'g' },
  { value: 'ml', label: 'ml' },
  { value: 'each', label: 'buc' },
  { value: 'package', label: 'pachet' },
]

type ReviewLine = {
  key: string
  included: boolean
  name: string
  quantity: string
  unit: Unit
  locationId: string
  productId: string | null
  matchName: string | null
  confidence: number | null
  lineTotal: number | null
  status: 'idle' | 'ok' | 'error'
  error: string | null
}

function defaultLocationId(locations: LocationRecord[]) {
  return locations.find((location) => location.name === 'Frigider')?.id ?? locations[0]?.id ?? ''
}

function toReviewLines(
  items: ReceiptDraftLineView[],
  locationId: string,
): ReviewLine[] {
  return items.map((item, index) => ({
    key: `${item.rawName}-${index}`,
    included: true,
    name: item.name,
    quantity: item.suggestedQuantity != null ? String(item.suggestedQuantity) : item.quantity != null ? String(item.quantity) : '1',
    unit: item.suggestedUnit ?? item.unit ?? 'package',
    locationId,
    productId: item.suggestedProduct?.id ?? null,
    matchName: item.suggestedProduct?.name ?? null,
    confidence: item.confidence,
    lineTotal: item.lineTotal,
    status: 'idle',
    error: null,
  }))
}

export function ReceiptReview({
  draft,
  locations,
  products,
  onClose,
  onDone,
}: {
  draft: ReceiptExtractResponse['receipt']
  locations: LocationRecord[]
  products: ProductRecord[]
  onClose: () => void
  onDone: () => void
}) {
  const fallbackLocation = defaultLocationId(locations)
  const [defaultLoc, setDefaultLoc] = useState(fallbackLocation)
  const [lines, setLines] = useState(() => toReviewLines(draft.items, fallbackLocation))
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const selected = useMemo(() => lines.filter((line) => line.included), [lines])

  function updateLine(key: string, patch: Partial<ReviewLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  async function commitLine(line: ReviewLine): Promise<ReviewLine> {
    try {
      const name = validateProductName(line.name).name
      const quantity = validateQuantity(Number(line.quantity.replace(',', '.')))
      if (!line.locationId) {
        throw new Error('Alege o locație.')
      }
      let productId = line.productId
      if (!productId) {
        const created = await createProduct({ name, unit: line.unit })
        productId = created.product.id
      }
      await addStock({
        productId,
        locationId: line.locationId,
        quantity,
        expiresOn: null,
      })
      return { ...line, productId, name, status: 'ok', error: null }
    } catch (cause) {
      return {
        ...line,
        status: 'error',
        error: cause instanceof Error && cause.message === 'Alege o locație.'
          ? cause.message
          : mapPantryApiError(cause),
      }
    }
  }

  async function commitAll() {
    if (busy) {
      return
    }
    setBusy(true)
    setFormError(null)
    const next = [...lines]
    for (let index = 0; index < next.length; index += 1) {
      const line = next[index]
      if (!line || !line.included || line.status === 'ok') {
        continue
      }
      next[index] = await commitLine(line)
      setLines([...next])
    }
    setBusy(false)
    if (next.filter((line) => line.included).every((line) => line.status === 'ok')) {
      onDone()
      return
    }
    if (next.some((line) => line.included && line.status === 'error')) {
      setFormError('Unele produse nu s-au putut adăuga. Corectează și reîncearcă.')
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Verifică bonul</h1>
      {draft.merchant || draft.date || draft.total != null ? (
        <p className="mt-2 text-sm text-muted">
          {[draft.merchant, draft.date, draft.total != null ? `${draft.total} ${draft.currency ?? ''}`.trim() : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
      ) : null}

      <div className="mt-4">
        <label className="text-sm font-medium" htmlFor="receipt-default-location">
          Unde pui produsele?
        </label>
        <select
          id="receipt-default-location"
          className={fieldClassName}
          value={defaultLoc}
          onChange={(event) => {
            const value = event.target.value
            setDefaultLoc(value)
            setLines((current) =>
              current.map((line) => (line.status === 'ok' ? line : { ...line, locationId: value })),
            )
          }}
        >
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </div>

      <ul className="mt-4 space-y-3">
        {lines.map((line) => (
          <li key={line.key} className="rounded-xl border border-border p-3">
            <label className="flex min-h-touch items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={line.included}
                disabled={line.status === 'ok'}
                onChange={(event) => updateLine(line.key, { included: event.target.checked })}
              />
              {line.name}
            </label>
            {line.matchName ? (
              <p className="mt-1 text-xs text-success">Potrivire: {line.matchName}</p>
            ) : (
              <p className="mt-1 text-xs text-muted">Produs nou</p>
            )}
            {line.confidence != null && line.confidence < 0.5 ? (
              <p className="mt-1 text-xs text-warning">Încredere scăzută</p>
            ) : null}
            <input
              value={line.name}
              disabled={line.status === 'ok' || !line.included}
              onChange={(event) => updateLine(line.key, { name: event.target.value, productId: null, matchName: null })}
              className={fieldClassName}
            />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input
                inputMode="decimal"
                value={line.quantity}
                disabled={line.status === 'ok' || !line.included}
                onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                className={fieldClassName}
              />
              <select
                value={line.unit}
                disabled={line.status === 'ok' || !line.included || line.productId != null}
                onChange={(event) => updateLine(line.key, { unit: event.target.value as Unit })}
                className={fieldClassName}
              >
                {UNIT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-1 text-xs text-muted">Unitate: {unitLabel(line.unit)}</p>
            <select
              className={fieldClassName}
              value={line.productId ?? ''}
              disabled={line.status === 'ok' || !line.included}
              onChange={(event) => {
                const id = event.target.value || null
                const match = products.find((product) => product.id === id)
                updateLine(line.key, {
                  productId: id,
                  matchName: match?.name ?? null,
                  unit: match?.unit ?? line.unit,
                })
              }}
            >
              <option value="">Produs nou</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
            <select
              className={fieldClassName}
              value={line.locationId}
              disabled={line.status === 'ok' || !line.included}
              onChange={(event) => updateLine(line.key, { locationId: event.target.value })}
            >
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
            {line.lineTotal != null ? <p className="mt-1 text-xs text-muted">{line.lineTotal} lei</p> : null}
            {line.status === 'ok' ? <p className="mt-1 text-xs text-success">Adăugat</p> : null}
            {line.error ? <p className="mt-1 text-xs text-destructive">{line.error}</p> : null}
          </li>
        ))}
      </ul>

      <div role="alert" className="mt-3 min-h-5 text-sm text-destructive">
        {formError}
      </div>
      <button
        type="button"
        disabled={busy || selected.length === 0}
        className="mt-3 flex h-touch min-h-touch w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground disabled:opacity-60"
        onClick={() => void commitAll()}
      >
        {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
        Adaugă în inventar
      </button>
      <button type="button" className="mt-3 w-full text-sm text-muted" onClick={onClose}>
        Anulează
      </button>
    </div>
  )
}
