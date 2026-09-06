import { DomainError, validateProductName, validateQuantity, type InventoryItem, type Unit } from '@pantry/core'
import { LoaderCircle, Plus, Search } from 'lucide-react'
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import { InventoryProductCard } from '../components/inventory/InventoryProductCard'
import { InventorySheet } from '../components/inventory/InventorySheet'
import { useHousehold } from '../household/HouseholdProvider'
import { isPantryApiError } from '../lib/api'
import {
  formatQuantity,
  unitLabel,
} from '../lib/inventory-format'
import {
  QUANTITY_INVALID_MESSAGE,
  PRODUCT_NAME_INVALID_MESSAGE,
  insufficientStockMessage,
  mapPantryApiError,
} from '../lib/pantry-api-error'
import { addStock, consumeStock, createProduct, getInventory } from '../lib/pantry-api'

const UNIT_OPTIONS: Array<{ value: Unit; label: string }> = [
  { value: 'g', label: 'g' },
  { value: 'ml', label: 'ml' },
  { value: 'each', label: 'buc' },
  { value: 'package', label: 'pachet' },
]

const fieldClassName =
  'mt-1.5 h-touch min-h-touch w-full rounded-lg border border-border bg-surface px-3 text-text shadow-surface placeholder:text-muted disabled:opacity-60'

type SheetState =
  | { type: 'closed' }
  | { type: 'add-product' }
  | { type: 'add-stock'; item: InventoryItem }
  | { type: 'consume'; item: InventoryItem }

export function InventoryPage() {
  const { household, locations } = useHousehold()
  const searchId = useId()
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [locationId, setLocationId] = useState<string | null>(null)
  const [items, setItems] = useState<InventoryItem[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<SheetState>({ type: 'closed' })

  const householdId = household?.id ?? null
  const activeLocationId = locations.some((location) => location.id === locationId)
    ? locationId
    : null

  const reload = useCallback(async () => {
    const data = await getInventory({
      search,
      locationId: activeLocationId ?? undefined,
    })
    setItems(data.items)
  }, [activeLocationId, search])

  useEffect(() => {
    const handle = window.setTimeout(() => setSearch(searchInput.trim()), 250)
    return () => window.clearTimeout(handle)
  }, [searchInput])

  useEffect(() => {
    setSearchInput('')
    setSearch('')
    setLocationId(null)
    setItems([])
    setSheet({ type: 'closed' })
  }, [householdId])

  useEffect(() => {
    if (!householdId) {
      return
    }

    let cancelled = false

    async function load() {
      setStatus('loading')
      setLoadError(null)
      try {
        await reload()
        if (!cancelled) {
          setStatus('ready')
        }
      } catch (cause) {
        if (!cancelled) {
          setStatus('error')
          setLoadError(mapPantryApiError(cause))
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [householdId, reload])

  const empty = status === 'ready' && items.length === 0 && !search && !activeLocationId
  const noMatches = status === 'ready' && items.length === 0 && (search.length > 0 || activeLocationId !== null)

  return (
    <section>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Inventar</h1>
          {household ? <p className="mt-1 truncate text-muted">{household.name}</p> : null}
        </div>
        <button
          type="button"
          className="flex min-h-touch shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-medium text-accent"
          onClick={() => setSheet({ type: 'add-product' })}
        >
          <Plus className="size-4" aria-hidden="true" />
          Adaugă produs
        </button>
      </div>

      <div className="mt-4">
        <label className="sr-only" htmlFor={searchId}>
          Caută produse
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            id={searchId}
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Caută produse"
            className={`${fieldClassName} mt-0 pl-9`}
          />
        </div>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        <FilterChip label="Toate" selected={activeLocationId === null} onClick={() => setLocationId(null)} />
        {locations.map((location) => (
          <FilterChip
            key={location.id}
            label={location.name}
            selected={activeLocationId === location.id}
            onClick={() => setLocationId(location.id)}
          />
        ))}
      </div>

      {status === 'loading' ? (
        <div className="mt-10 flex justify-center text-muted">
          <LoaderCircle className="size-6 animate-spin" aria-label="Se încarcă inventarul" />
        </div>
      ) : null}

      {status === 'error' ? <p className="mt-8 text-sm text-destructive">{loadError}</p> : null}

      {empty ? (
        <div className="mt-10 text-center">
          <p className="text-muted">Inventarul tău este gol.</p>
          <button
            type="button"
            className="mt-4 inline-flex h-touch min-h-touch items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground shadow-surface"
            onClick={() => setSheet({ type: 'add-product' })}
          >
            Adaugă primul produs
          </button>
        </div>
      ) : null}

      {noMatches ? <p className="mt-8 text-muted">Niciun produs găsit.</p> : null}

      {status === 'ready' && items.length > 0 ? (
        <ul className="mt-5 space-y-3">
          {items.map((item) => (
            <li key={item.product.id}>
              <InventoryProductCard
                item={item}
                onAddStock={() => setSheet({ type: 'add-stock', item })}
                onConsume={() => setSheet({ type: 'consume', item })}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {sheet.type === 'add-product' ? (
        <AddProductSheet
          defaultLocationId={locations[0]?.id ?? ''}
          locations={locations}
          onClose={() => setSheet({ type: 'closed' })}
          onSaved={async () => {
            await reload()
            setSheet({ type: 'closed' })
          }}
        />
      ) : null}

      {sheet.type === 'add-stock' ? (
        <AddStockSheet
          item={sheet.item}
          defaultLocationId={sheet.item.lots[0]?.locationId ?? locations[0]?.id ?? ''}
          locations={locations}
          onClose={() => setSheet({ type: 'closed' })}
          onSaved={async () => {
            await reload()
            setSheet({ type: 'closed' })
          }}
        />
      ) : null}

      {sheet.type === 'consume' ? (
        <ConsumeSheet
          item={sheet.item}
          onClose={() => setSheet({ type: 'closed' })}
          onSaved={async () => {
            await reload()
            setSheet({ type: 'closed' })
          }}
        />
      ) : null}
    </section>
  )
}

function FilterChip({
  label,
  selected,
  onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-touch min-h-touch shrink-0 items-center rounded-full border px-3 text-sm ${
        selected
          ? 'border-accent bg-accent text-accent-foreground'
          : 'border-border bg-surface-elevated text-text'
      }`}
    >
      {label}
    </button>
  )
}

function AddProductSheet({
  locations,
  defaultLocationId,
  onClose,
  onSaved,
}: {
  locations: Array<{ id: string; name: string }>
  defaultLocationId: string
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const nameId = useId()
  const brandId = useId()
  const unitId = useId()
  const quantityId = useId()
  const locationIdField = useId()
  const expiryId = useId()
  const errorId = useId()
  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [unit, setUnit] = useState<Unit>('ml')
  const [quantity, setQuantity] = useState('')
  const [locationId, setLocationId] = useState(defaultLocationId)
  const [expiresOn, setExpiresOn] = useState('')
  const [createdProductId, setCreatedProductId] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

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

    let parsedQuantity: number
    try {
      parsedQuantity = validateQuantity(Number(quantity.replace(',', '.')))
    } catch {
      setFormError(QUANTITY_INVALID_MESSAGE)
      return
    }

    if (!locationId) {
      setFormError('Alege o locație.')
      return
    }

    setIsSubmitting(true)

    try {
      let productId = createdProductId
      if (!productId) {
        const created = await createProduct({
          name: productName,
          brand: brand.trim() || undefined,
          unit,
        })
        productId = created.product.id
        setCreatedProductId(productId)
      }

      await addStock({
        productId,
        locationId,
        quantity: parsedQuantity,
        expiresOn: expiresOn.trim() || null,
      })
      await onSaved()
    } catch (cause) {
      setFormError(mapPantryApiError(cause))
    } finally {
      setIsSubmitting(false)
    }
  }

  const productLocked = createdProductId !== null

  return (
    <InventorySheet title={productLocked ? 'Finalizează stocul' : 'Adaugă produs'} onClose={onClose}>
      {productLocked ? (
        <p className="mb-3 text-sm text-warning">
          Produsul a fost creat, dar stocul nu s-a salvat. Completează cantitatea și încearcă din nou.
        </p>
      ) : null}
      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        <div>
          <label className="text-sm font-medium" htmlFor={nameId}>
            Produs
          </label>
          <input
            id={nameId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={isSubmitting || productLocked}
            required
            maxLength={120}
            className={fieldClassName}
            placeholder="Lapte"
          />
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor={brandId}>
            Brand (opțional)
          </label>
          <input
            id={brandId}
            value={brand}
            onChange={(event) => setBrand(event.target.value)}
            disabled={isSubmitting || productLocked}
            maxLength={80}
            className={fieldClassName}
            placeholder="Pilos"
          />
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor={unitId}>
            Unitate
          </label>
          <select
            id={unitId}
            value={unit}
            onChange={(event) => setUnit(event.target.value as Unit)}
            disabled={isSubmitting || productLocked}
            className={fieldClassName}
          >
            {UNIT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor={quantityId}>
            Cantitate
          </label>
          <input
            id={quantityId}
            inputMode="decimal"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            disabled={isSubmitting}
            required
            className={fieldClassName}
            placeholder="1000"
          />
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor={locationIdField}>
            Locație
          </label>
          <select
            id={locationIdField}
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
            disabled={isSubmitting}
            className={fieldClassName}
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor={expiryId}>
            Data expirării (opțional)
          </label>
          <input
            id={expiryId}
            type="date"
            value={expiresOn}
            onChange={(event) => setExpiresOn(event.target.value)}
            disabled={isSubmitting}
            className={fieldClassName}
          />
        </div>
        <div id={errorId} role="alert" aria-live="assertive" className="min-h-5 text-sm text-destructive">
          {formError}
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
          className="flex h-touch min-h-touch w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground shadow-surface disabled:opacity-60"
        >
          {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
          {isSubmitting ? 'Se salvează...' : productLocked ? 'Salvează stocul' : 'Adaugă produs'}
        </button>
      </form>
    </InventorySheet>
  )
}

function AddStockSheet({
  item,
  locations,
  defaultLocationId,
  onClose,
  onSaved,
}: {
  item: InventoryItem
  locations: Array<{ id: string; name: string }>
  defaultLocationId: string
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const quantityId = useId()
  const locationIdField = useId()
  const expiryId = useId()
  const [quantity, setQuantity] = useState('')
  const [locationId, setLocationId] = useState(defaultLocationId)
  const [expiresOn, setExpiresOn] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) {
      return
    }

    setFormError(null)
    let parsedQuantity: number
    try {
      parsedQuantity = validateQuantity(Number(quantity.replace(',', '.')))
    } catch {
      setFormError(QUANTITY_INVALID_MESSAGE)
      return
    }

    setIsSubmitting(true)
    try {
      await addStock({
        productId: item.product.id,
        locationId,
        quantity: parsedQuantity,
        expiresOn: expiresOn.trim() || null,
      })
      await onSaved()
    } catch (cause) {
      setFormError(mapPantryApiError(cause))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <InventorySheet title={`Adaugă stoc · ${item.product.name}`} onClose={onClose}>
      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        <div>
          <label className="text-sm font-medium" htmlFor={quantityId}>
            Cantitate ({unitLabel(item.product.unit)})
          </label>
          <input
            id={quantityId}
            inputMode="decimal"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            disabled={isSubmitting}
            required
            className={fieldClassName}
            placeholder="500"
          />
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor={locationIdField}>
            Locație
          </label>
          <select
            id={locationIdField}
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
            disabled={isSubmitting}
            className={fieldClassName}
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor={expiryId}>
            Data expirării (opțional)
          </label>
          <input
            id={expiryId}
            type="date"
            value={expiresOn}
            onChange={(event) => setExpiresOn(event.target.value)}
            disabled={isSubmitting}
            className={fieldClassName}
          />
        </div>
        <div role="alert" aria-live="assertive" className="min-h-5 text-sm text-destructive">
          {formError}
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
          className="flex h-touch min-h-touch w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground shadow-surface disabled:opacity-60"
        >
          {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
          {isSubmitting ? 'Se salvează...' : 'Adaugă stoc'}
        </button>
      </form>
    </InventorySheet>
  )
}

function ConsumeSheet({
  item,
  onClose,
  onSaved,
}: {
  item: InventoryItem
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const quantityId = useId()
  const [quantity, setQuantity] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) {
      return
    }

    setFormError(null)
    let parsedQuantity: number
    try {
      parsedQuantity = validateQuantity(Number(quantity.replace(',', '.')))
    } catch {
      setFormError(QUANTITY_INVALID_MESSAGE)
      return
    }

    setIsSubmitting(true)
    try {
      await consumeStock({ productId: item.product.id, quantity: parsedQuantity })
      await onSaved()
    } catch (cause) {
      if (isPantryApiError(cause) && cause.code === 'INSUFFICIENT_STOCK') {
        const available = cause.available ?? item.totalQuantity
        setFormError(insufficientStockMessage(formatQuantity(available, item.product.unit)))
      } else {
        setFormError(mapPantryApiError(cause))
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <InventorySheet title={`Consumă · ${item.product.name}`} onClose={onClose}>
      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        <div>
          <label className="text-sm font-medium" htmlFor={quantityId}>
            Cantitate de consumat
          </label>
          <input
            id={quantityId}
            inputMode="decimal"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            disabled={isSubmitting}
            required
            className={fieldClassName}
            placeholder={`250 ${unitLabel(item.product.unit)}`}
          />
          <p className="mt-1 text-sm text-muted">
            Disponibil: {formatQuantity(item.totalQuantity, item.product.unit)}
          </p>
        </div>
        <div role="alert" aria-live="assertive" className="min-h-5 text-sm text-destructive">
          {formError}
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
          className="flex h-touch min-h-touch w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground shadow-surface disabled:opacity-60"
        >
          {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
          {isSubmitting ? 'Se consumă...' : 'Consumă'}
        </button>
      </form>
    </InventorySheet>
  )
}
