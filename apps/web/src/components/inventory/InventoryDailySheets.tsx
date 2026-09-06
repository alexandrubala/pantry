import {
  DomainError,
  validateMinimumQuantity,
  validateNonNegativeQuantity,
  validateProductName,
  type InventoryHistoryEntry,
  type InventoryItem,
  type InventoryLotRecord,
} from '@pantry/core'
import { LoaderCircle } from 'lucide-react'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { InventorySheet } from './InventorySheet'
import {
  formatHistoryHeadline,
  formatHistoryWhen,
  formatLotExpiry,
  formatQuantity,
  unitLabel,
} from '../../lib/inventory-format'
import {
  PRODUCT_NAME_INVALID_MESSAGE,
  QUANTITY_INVALID_MESSAGE,
  mapPantryApiError,
} from '../../lib/pantry-api-error'
import {
  adjustLot,
  getInventoryHistory,
  moveLot,
  setMinimumQuantity,
  updateProduct,
} from '../../lib/pantry-api'

const fieldClassName =
  'mt-1.5 h-touch min-h-touch w-full rounded-lg border border-border bg-surface px-3 text-text shadow-surface placeholder:text-muted disabled:opacity-60'

export function MinimumStockSheet({
  item,
  onClose,
  onSaved,
}: {
  item: InventoryItem
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const quantityId = useId()
  const [quantity, setQuantity] = useState(item.minimumQuantity > 0 ? String(item.minimumQuantity) : '')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) {
      return
    }

    setFormError(null)
    let parsed: number
    try {
      parsed = validateMinimumQuantity(Number((quantity.trim() || '0').replace(',', '.')))
    } catch {
      setFormError(QUANTITY_INVALID_MESSAGE)
      return
    }

    setIsSubmitting(true)
    try {
      await setMinimumQuantity(item.product.id, parsed)
      await onSaved()
    } catch (cause) {
      setFormError(mapPantryApiError(cause))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <InventorySheet title={`Stoc minim · ${item.product.name}`} onClose={onClose}>
      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        <div>
          <label className="text-sm font-medium" htmlFor={quantityId}>
            Stoc minim
          </label>
          <div className="flex items-center gap-2">
            <input
              id={quantityId}
              inputMode="decimal"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              disabled={isSubmitting}
              className={fieldClassName}
              placeholder="0"
            />
            <span className="mt-1.5 shrink-0 text-sm text-muted">{unitLabel(item.product.unit)}</span>
          </div>
          <p className="mt-1 text-sm text-muted">0 dezactivează pragul.</p>
        </div>
        <div role="alert" className="min-h-5 text-sm text-destructive">
          {formError}
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex h-touch min-h-touch w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground disabled:opacity-60"
        >
          {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
          {isSubmitting ? 'Se salvează...' : 'Salvează'}
        </button>
      </form>
    </InventorySheet>
  )
}

export function EditProductSheet({
  item,
  onClose,
  onSaved,
}: {
  item: InventoryItem
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const nameId = useId()
  const brandId = useId()
  const [name, setName] = useState(item.product.name)
  const [brand, setBrand] = useState(item.product.brand ?? '')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const unitLocked = item.lots.length > 0 || item.totalQuantity > 0

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) {
      return
    }

    setFormError(null)
    let productName: string
    try {
      productName = validateProductName(name).name
    } catch (error) {
      setFormError(error instanceof DomainError ? PRODUCT_NAME_INVALID_MESSAGE : mapPantryApiError(error))
      return
    }

    setIsSubmitting(true)
    try {
      await updateProduct(item.product.id, {
        name: productName,
        brand: brand.trim() || null,
      })
      await onSaved()
    } catch (cause) {
      setFormError(mapPantryApiError(cause))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <InventorySheet title="Editează produsul" onClose={onClose}>
      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        <div>
          <label className="text-sm font-medium" htmlFor={nameId}>
            Produs
          </label>
          <input id={nameId} value={name} onChange={(event) => setName(event.target.value)} className={fieldClassName} />
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor={brandId}>
            Brand
          </label>
          <input
            id={brandId}
            value={brand}
            onChange={(event) => setBrand(event.target.value)}
            className={fieldClassName}
          />
        </div>
        <div>
          <p className="text-sm font-medium">Unitate</p>
          <p className="mt-1.5 text-sm text-muted">{unitLabel(item.product.unit)}</p>
          {unitLocked ? <p className="mt-1 text-sm text-muted">Unitatea nu mai poate fi schimbată.</p> : null}
        </div>
        <div role="alert" className="min-h-5 text-sm text-destructive">
          {formError}
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex h-touch min-h-touch w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground disabled:opacity-60"
        >
          {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
          {isSubmitting ? 'Se salvează...' : 'Salvează'}
        </button>
      </form>
    </InventorySheet>
  )
}

export function LotsSheet({
  item,
  locations,
  onClose,
  onSaved,
}: {
  item: InventoryItem
  locations: Array<{ id: string; name: string }>
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [selected, setSelected] = useState<InventoryLotRecord | null>(null)
  const [quantity, setQuantity] = useState('')
  const [locationId, setLocationId] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function openLot(lot: InventoryLotRecord) {
    setSelected(lot)
    setQuantity(String(lot.quantity))
    setLocationId(lot.locationId)
    setFormError(null)
  }

  async function handleAdjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || isSubmitting) {
      return
    }

    setFormError(null)
    let parsed: number
    try {
      parsed = validateNonNegativeQuantity(Number(quantity.replace(',', '.')))
    } catch {
      setFormError(QUANTITY_INVALID_MESSAGE)
      return
    }

    setIsSubmitting(true)
    try {
      if (locationId !== selected.locationId) {
        await moveLot({ lotId: selected.id, locationId })
      } else if (parsed !== selected.quantity) {
        await adjustLot({
          lotId: selected.id,
          expectedQuantity: selected.quantity,
          quantity: parsed,
        })
      }
      await onSaved()
    } catch (cause) {
      setFormError(mapPantryApiError(cause))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <InventorySheet title={`Loturi · ${item.product.name}`} onClose={onClose}>
      {item.lots.length === 0 ? <p className="text-sm text-muted">Nu există loturi.</p> : null}
      <ul className="space-y-2">
        {item.lots.map((lot) => (
          <li key={lot.id}>
            <button
              type="button"
              className="flex w-full min-h-touch flex-col items-start rounded-xl border border-border px-3 py-2 text-left"
              onClick={() => openLot(lot)}
            >
              <span className="font-medium">{lot.locationName}</span>
              <span className="text-sm text-muted">
                {formatQuantity(lot.quantity, item.product.unit)} · {formatLotExpiry(lot.expiresOn)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {selected ? (
        <form className="mt-4 flex flex-col gap-3 border-t border-border pt-4" onSubmit={handleAdjust}>
          <p className="text-sm font-medium">Corectează lotul</p>
          <div>
            <label className="text-sm font-medium" htmlFor="lot-qty">
              Cantitate ({unitLabel(item.product.unit)})
            </label>
            <input
              id="lot-qty"
              inputMode="decimal"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className={fieldClassName}
            />
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="lot-loc">
              Mută în
            </label>
            <select
              id="lot-loc"
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
              className={fieldClassName}
            >
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>
          <div role="alert" className="min-h-5 text-sm text-destructive">
            {formError}
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex h-touch min-h-touch w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground disabled:opacity-60"
          >
            {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            {isSubmitting ? 'Se salvează...' : 'Salvează'}
          </button>
        </form>
      ) : null}
    </InventorySheet>
  )
}

export function HistorySheet({
  productId,
  productName,
  onClose,
}: {
  productId?: string
  productName?: string
  onClose: () => void
}) {
  const [entries, setEntries] = useState<InventoryHistoryEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void getInventoryHistory(productId)
      .then((data) => {
        if (!cancelled) {
          setEntries(data.history)
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(mapPantryApiError(cause))
        }
      })
    return () => {
      cancelled = true
    }
  }, [productId])

  return (
    <InventorySheet title={productName ? `Istoric · ${productName}` : 'Istoric'} onClose={onClose}>
      {entries == null && !error ? (
        <div className="flex justify-center py-6 text-muted">
          <LoaderCircle className="size-5 animate-spin" aria-label="Se încarcă istoricul" />
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {entries && entries.length === 0 ? <p className="text-sm text-muted">Nu există mișcări recente.</p> : null}
      {entries && entries.length > 0 ? (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li key={entry.id}>
              <p className="font-medium">{formatHistoryHeadline(entry)}</p>
              <p className="text-sm text-muted">{entry.locationName}</p>
              <p className="text-sm text-muted">{formatHistoryWhen(entry.createdAt)}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </InventorySheet>
  )
}
