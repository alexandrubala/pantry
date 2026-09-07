import { DomainError, suggestShoppingQuantity, validateQuantity, validateProductName, type InventoryItem, type InventorySummary, type Unit } from '@pantry/core'
import { LoaderCircle, Plus, Search } from 'lucide-react'
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import {
  CorrectUnitSheet,
  EditProductSheet,
  HistorySheet,
  LotsSheet,
  MinimumStockSheet,
} from '../components/inventory/InventoryDailySheets'
import { ConsumeSheet } from '../components/inventory/ConsumeSheet'
import { InventoryProductCard } from '../components/inventory/InventoryProductCard'
import { InventorySheet } from '../components/inventory/InventorySheet'
import { useHousehold } from '../household/HouseholdProvider'
import {
  attentionCards,
  itemMatchesStatusFilter,
  localIsoDate,
  quickAddLot,
  unitLabel,
  type InventoryStatusFilter,
} from '../lib/inventory-format'
import {
  QUANTITY_INVALID_MESSAGE,
  PRODUCT_NAME_INVALID_MESSAGE,
  mapPantryApiError,
} from '../lib/pantry-api-error'
import { addStock, addShoppingProductItem, consumeStock, createProduct, getInventory, getInventorySummary } from '../lib/pantry-api'

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
  | { type: 'shop'; item: InventoryItem }
  | { type: 'minimum'; item: InventoryItem }
  | { type: 'edit'; item: InventoryItem }
  | { type: 'correct-unit'; item: InventoryItem }
  | { type: 'lots'; item: InventoryItem }
  | { type: 'history'; item?: InventoryItem }

export function InventoryPage() {
  const { household, locations } = useHousehold()
  const searchId = useId()
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [locationId, setLocationId] = useState<string | null>(null)
  const [items, setItems] = useState<InventoryItem[]>([])
  const [summary, setSummary] = useState<InventorySummary | null>(null)
  const [statusFilter, setStatusFilter] = useState<InventoryStatusFilter>('all')
  const [today] = useState(() => localIsoDate())
  const [busyProductId, setBusyProductId] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<SheetState>({ type: 'closed' })
  const [shopNotice, setShopNotice] = useState<string | null>(null)
  const [shopError, setShopError] = useState<string | null>(null)
  const [shoppingProductId, setShoppingProductId] = useState<string | null>(null)

  const householdId = household?.id ?? null
  const activeLocationId = locations.some((location) => location.id === locationId)
    ? locationId
    : null

  const reload = useCallback(async () => {
    const [data, nextSummary] = await Promise.all([
      getInventory({
        search,
        locationId: activeLocationId ?? undefined,
      }),
      getInventorySummary(today),
    ])
    setItems(data.items)
    setSummary(nextSummary)
  }, [activeLocationId, search, today])

  useEffect(() => {
    const handle = window.setTimeout(() => setSearch(searchInput.trim()), 250)
    return () => window.clearTimeout(handle)
  }, [searchInput])

  useEffect(() => {
    setSearchInput('')
    setSearch('')
    setLocationId(null)
    setItems([])
    setSummary(null)
    setStatusFilter('all')
    setSheet({ type: 'closed' })
    setShopNotice(null)
    setShopError(null)
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

  const visibleItems = items.filter((item) => itemMatchesStatusFilter(item, statusFilter, today))
  const attention = status === 'ready' ? attentionCards(items, today) : []
  const empty = status === 'ready' && items.length === 0 && !search && !activeLocationId && statusFilter === 'all'
  const noMatches =
    status === 'ready' &&
    visibleItems.length === 0 &&
    (search.length > 0 || activeLocationId !== null || statusFilter !== 'all')

  async function addInventoryProductToShopping(item: InventoryItem, quantity: number, unit: Unit) {
    await addShoppingProductItem({
      productId: item.product.id,
      quantity,
      unit,
    })
    setShopError(null)
    setShopNotice(`${item.product.name} a fost adăugat la cumpărături.`)
  }

  async function handleAddToShopping(item: InventoryItem) {
    if (shoppingProductId) {
      return
    }

    const suggestion = suggestShoppingQuantity(item.product)
    if (!suggestion) {
      setSheet({ type: 'shop', item })
      return
    }

    setShoppingProductId(item.product.id)
    setShopNotice(null)
    setShopError(null)
    try {
      await addInventoryProductToShopping(item, suggestion.quantity, suggestion.unit)
    } catch (cause) {
      setShopError(mapPantryApiError(cause))
    } finally {
      setShoppingProductId(null)
    }
  }

  async function runProductAction(productId: string, work: () => Promise<void>) {
    if (busyProductId) {
      return
    }

    setBusyProductId(productId)
    setShopError(null)
    try {
      await work()
      await reload()
    } catch (cause) {
      setShopError(mapPantryApiError(cause))
    } finally {
      setBusyProductId(null)
    }
  }

  function handleQuickAdd(item: InventoryItem) {
    const locationId = activeLocationId ?? locations[0]?.id ?? item.lots[0]?.locationId ?? ''
    const lot = locationId ? quickAddLot(item, locationId) : null
    if (!lot) {
      setSheet({ type: 'add-stock', item })
      return
    }

    void runProductAction(item.product.id, async () => {
      await addStock({
        productId: item.product.id,
        locationId: lot.locationId,
        quantity: 1,
        expiresOn: null,
      })
    })
  }

  function handleQuickConsume(item: InventoryItem) {
    void runProductAction(item.product.id, async () => {
      await consumeStock({ productId: item.product.id, quantity: 1 })
    })
  }

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

      {summary ? (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <SummaryCard
            label="Produse"
            value={summary.products}
            selected={statusFilter === 'all'}
            onClick={() => setStatusFilter('all')}
          />
          <SummaryCard
            label="Stoc scăzut"
            value={summary.lowStock}
            selected={statusFilter === 'low'}
            onClick={() => setStatusFilter('low')}
          />
          <SummaryCard
            label="Expiră curând"
            value={summary.expiringSoon + summary.expired}
            selected={statusFilter === 'soon'}
            onClick={() => setStatusFilter('soon')}
          />
        </div>
      ) : null}

      {attention.length > 0 ? (
        <section className="mt-4">
          <h2 className="text-sm font-semibold">Necesită atenție</h2>
          <ul className="mt-2 space-y-2">
            {attention.map((card) => (
              <li key={`${card.reason}-${card.productId}`}>
                <button
                  type="button"
                  className="flex w-full min-h-touch flex-col items-start rounded-xl border border-border bg-surface-elevated px-3 py-2 text-left"
                  onClick={() =>
                    setStatusFilter(card.reason === 'low' ? 'low' : card.reason === 'expired' ? 'expired' : 'soon')
                  }
                >
                  <span className="font-medium">{card.name}</span>
                  <span className="text-sm text-muted">{card.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
        <FilterChip label="Toate" selected={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
        <FilterChip label="Stoc scăzut" selected={statusFilter === 'low'} onClick={() => setStatusFilter('low')} />
        <FilterChip label="Expiră curând" selected={statusFilter === 'soon'} onClick={() => setStatusFilter('soon')} />
        <FilterChip label="Expirate" selected={statusFilter === 'expired'} onClick={() => setStatusFilter('expired')} />
      </div>

      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        <FilterChip label="Toate locațiile" selected={activeLocationId === null} onClick={() => setLocationId(null)} />
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

      {shopNotice ? <p className="mt-4 text-sm text-success">{shopNotice}</p> : null}
      {shopError ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {shopError}
        </p>
      ) : null}

      {empty ? (
        <div className="mt-10 text-center">
          <p className="text-muted">Inventarul tău este gol.</p>
          <p className="mt-1 text-sm text-muted">Adaugă un produs sau scanează un cod de bare.</p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              className="inline-flex h-touch min-h-touch items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground shadow-surface"
              onClick={() => setSheet({ type: 'add-product' })}
            >
              Adaugă primul produs
            </button>
            <Link
              to="/scan"
              className="inline-flex h-touch min-h-touch items-center justify-center rounded-lg border border-border px-4 text-sm font-medium"
            >
              Scanează
            </Link>
          </div>
        </div>
      ) : null}

      {noMatches ? <p className="mt-8 text-muted">Niciun produs găsit.</p> : null}

      {status === 'ready' && visibleItems.length > 0 ? (
        <ul className="mt-5 space-y-3">
          {visibleItems.map((item) => (
            <li key={item.product.id}>
              <InventoryProductCard
                item={item}
                today={today}
                busy={busyProductId === item.product.id}
                shoppingBusy={shoppingProductId === item.product.id}
                onQuickAdd={() => handleQuickAdd(item)}
                onAddStock={() => setSheet({ type: 'add-stock', item })}
                onConsume={() => setSheet({ type: 'consume', item })}
                onQuickConsume={() => handleQuickConsume(item)}
                onAddToShopping={() => void handleAddToShopping(item)}
                onMinimum={() => setSheet({ type: 'minimum', item })}
                onEdit={
                  item.product.householdOwned ? () => setSheet({ type: 'edit', item }) : undefined
                }
                onCorrectUnit={
                  !item.product.householdOwned && item.product.barcode
                    ? () => setSheet({ type: 'correct-unit', item })
                    : undefined
                }
                onLots={() => setSheet({ type: 'lots', item })}
                onHistory={() => setSheet({ type: 'history', item })}
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

      {sheet.type === 'shop' ? (
        <ShopConfirmSheet
          item={sheet.item}
          onClose={() => setSheet({ type: 'closed' })}
          onSaved={async (quantity, unit) => {
            await addInventoryProductToShopping(sheet.item, quantity, unit)
            setSheet({ type: 'closed' })
          }}
        />
      ) : null}

      {sheet.type === 'minimum' ? (
        <MinimumStockSheet
          item={sheet.item}
          onClose={() => setSheet({ type: 'closed' })}
          onSaved={async () => {
            await reload()
            setSheet({ type: 'closed' })
          }}
        />
      ) : null}

      {sheet.type === 'edit' ? (
        <EditProductSheet
          item={sheet.item}
          onClose={() => setSheet({ type: 'closed' })}
          onSaved={async () => {
            await reload()
            setSheet({ type: 'closed' })
          }}
        />
      ) : null}

      {sheet.type === 'correct-unit' ? (
        <CorrectUnitSheet
          item={sheet.item}
          onClose={() => setSheet({ type: 'closed' })}
          onSaved={async () => {
            await reload()
            setSheet({ type: 'closed' })
          }}
        />
      ) : null}

      {sheet.type === 'lots' ? (
        <LotsSheet
          item={items.find((entry) => entry.product.id === sheet.item.product.id) ?? { ...sheet.item, lots: [], totalQuantity: 0 }}
          locations={locations}
          today={today}
          onClose={() => setSheet({ type: 'closed' })}
          onSaved={async () => {
            await reload()
          }}
        />
      ) : null}

      {sheet.type === 'history' ? (
        <HistorySheet
          productId={sheet.item?.product.id}
          productName={sheet.item?.product.name}
          onClose={() => setSheet({ type: 'closed' })}
        />
      ) : null}
    </section>
  )
}

function SummaryCard({
  label,
  value,
  selected,
  onClick,
}: {
  label: string
  value: number
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-2 py-2 text-left ${
        selected ? 'border-accent bg-accent text-accent-foreground' : 'border-border bg-surface-elevated'
      }`}
    >
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-xs leading-tight">{label}</p>
    </button>
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

function ShopConfirmSheet({
  item,
  onClose,
  onSaved,
}: {
  item: InventoryItem
  onClose: () => void
  onSaved: (quantity: number, unit: Unit) => Promise<void>
}) {
  const quantityId = useId()
  const unitId = useId()
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState<Unit>(item.product.unit)
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
      await onSaved(parsedQuantity, unit)
    } catch (cause) {
      setFormError(mapPantryApiError(cause))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <InventorySheet title={`Cumpără · ${item.product.name}`} onClose={onClose}>
      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
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
            placeholder="500"
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
          {isSubmitting ? 'Se adaugă...' : 'Adaugă la cumpărături'}
        </button>
      </form>
    </InventorySheet>
  )
}
