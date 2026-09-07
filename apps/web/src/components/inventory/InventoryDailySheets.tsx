import {
  DomainError,
  validateMinimumQuantity,
  validateNonNegativeQuantity,
  validateProductName,
  validateProductUnit,
  type InventoryHistoryEntry,
  type InventoryItem,
  type Unit,
} from '@pantry/core'
import { LoaderCircle } from 'lucide-react'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { InventorySheet } from './InventorySheet'
import {
  formatHistoryHeadline,
  formatHistoryWhen,
  formatQuantity,
  unitLabel,
} from '../../lib/inventory-format'
import {
  PRODUCT_NAME_INVALID_MESSAGE,
  QUANTITY_INVALID_MESSAGE,
  mapPantryApiError,
} from '../../lib/pantry-api-error'
import {
  getInventoryHistory,
  overrideHouseholdProductUnit,
  setMinimumQuantity,
  updateProduct,
} from '../../lib/pantry-api'

const UNIT_OPTIONS: Array<{ value: Unit; label: string }> = [
  { value: 'g', label: 'g' },
  { value: 'ml', label: 'ml' },
  { value: 'each', label: 'buc' },
  { value: 'package', label: 'pachet' },
]

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

export function CorrectUnitSheet({
  item,
  onClose,
  onSaved,
}: {
  item: InventoryItem
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const unitId = useId()
  const [unit, setUnit] = useState<Unit>(item.product.unit === 'g' || item.product.unit === 'ml' ? 'package' : item.product.unit)
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(item.lots.map((lot) => [lot.id, ''])),
  )
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) {
      return
    }

    setFormError(null)
    let nextUnit: Unit
    try {
      nextUnit = validateProductUnit(unit)
    } catch {
      setFormError('Alege o unitate validă.')
      return
    }

    const lots: Array<{ lotId: string; quantity: number }> = []
    for (const lot of item.lots) {
      try {
        lots.push({
          lotId: lot.id,
          quantity: validateNonNegativeQuantity(Number((quantities[lot.id] ?? '').replace(',', '.'))),
        })
      } catch {
        setFormError(QUANTITY_INVALID_MESSAGE)
        return
      }
    }

    setIsSubmitting(true)
    try {
      await overrideHouseholdProductUnit(item.product.id, { unit: nextUnit, lots })
      await onSaved()
    } catch (cause) {
      setFormError(mapPantryApiError(cause))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <InventorySheet title="Corectează unitatea" onClose={onClose}>
      <p className="mb-3 text-sm text-muted">
        Corecția rămâne doar pentru casa ta. Produsul din catalog nu se schimbă. Introdu cantitatea corectă
        pentru fiecare lot — Pantry nu convertește {unitLabel(item.product.unit)} în {unitLabel(unit)}.
      </p>
      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        <div>
          <label className="text-sm font-medium" htmlFor={unitId}>
            Unitate nouă
          </label>
          <select
            id={unitId}
            value={unit}
            onChange={(event) => setUnit(event.target.value as Unit)}
            disabled={isSubmitting}
            className={fieldClassName}
          >
            {UNIT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        {item.lots.map((lot) => (
          <div key={lot.id}>
            <label className="text-sm font-medium" htmlFor={`override-${lot.id}`}>
              {formatQuantity(lot.quantity, item.product.unit)} · {lot.locationName}
              {lot.expiresOn ? ` · ${lot.expiresOn}` : ' · fără expirare'}
            </label>
            <div className="flex items-center gap-2">
              <input
                id={`override-${lot.id}`}
                inputMode="decimal"
                value={quantities[lot.id] ?? ''}
                onChange={(event) =>
                  setQuantities((current) => ({ ...current, [lot.id]: event.target.value }))
                }
                disabled={isSubmitting}
                required
                className={fieldClassName}
                placeholder="1"
              />
              <span className="mt-1.5 shrink-0 text-sm text-muted">{unitLabel(unit)}</span>
            </div>
          </div>
        ))}
        <div role="alert" className="min-h-5 text-sm text-destructive">
          {formError}
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex h-touch min-h-touch w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground disabled:opacity-60"
        >
          {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
          {isSubmitting ? 'Se salvează...' : 'Corectează pentru casa mea'}
        </button>
      </form>
    </InventorySheet>
  )
}

export { LotsSheet } from './LotsSheet'

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
