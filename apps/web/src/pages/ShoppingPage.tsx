import {
  DomainError,
  suggestShoppingQuantity,
  validateOptionalShoppingQuantity,
  validateOptionalShoppingUnit,
  validateShoppingItemName,
  type ProductRecord,
  type ShoppingItem,
  type Unit,
} from '@pantry/core'
import { LoaderCircle, Plus, Search, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import { InventorySheet } from '../components/inventory/InventorySheet'
import { useHousehold } from '../household/HouseholdProvider'
import { formatQuantity, unitLabel } from '../lib/inventory-format'
import {
  PRODUCT_NAME_INVALID_MESSAGE,
  QUANTITY_INVALID_MESSAGE,
  mapPantryApiError,
} from '../lib/pantry-api-error'
import {
  addShoppingManualItem,
  addShoppingProductItem,
  clearCompletedShoppingItems,
  getProducts,
  getShoppingList,
  removeShoppingItem,
  toggleShoppingItem,
} from '../lib/pantry-api'

const UNIT_OPTIONS: Array<{ value: Unit; label: string }> = [
  { value: 'g', label: 'g' },
  { value: 'ml', label: 'ml' },
  { value: 'each', label: 'buc' },
  { value: 'package', label: 'pachet' },
]

const fieldClassName =
  'mt-1.5 h-touch min-h-touch w-full rounded-lg border border-border bg-surface px-3 text-text shadow-surface placeholder:text-muted disabled:opacity-60'

type SheetState = { type: 'closed' } | { type: 'manual' } | { type: 'products' }

export function ShoppingPage() {
  const { household } = useHousehold()
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<SheetState>({ type: 'closed' })
  const [clearing, setClearing] = useState(false)
  const householdId = household?.id ?? null

  const reload = useCallback(async () => {
    const data = await getShoppingList()
    setItems(data.list.items)
  }, [])

  useEffect(() => {
    setItems([])
    setSheet({ type: 'closed' })
    setActionError(null)
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

  const remaining = items.filter((item) => !item.checked)
  const completed = items.filter((item) => item.checked)
  const empty = status === 'ready' && items.length === 0

  async function handleToggle(item: ShoppingItem) {
    const nextChecked = !item.checked
    setActionError(null)
    setItems((current) =>
      current.map((entry) => (entry.id === item.id ? { ...entry, checked: nextChecked } : entry)),
    )

    try {
      const result = await toggleShoppingItem(item.id, nextChecked)
      setItems((current) => {
        const without = current.filter((entry) => entry.id !== item.id && entry.id !== result.item.id)
        return sortShoppingItems([...without, result.item])
      })
    } catch (cause) {
      setItems((current) =>
        current.map((entry) => (entry.id === item.id ? { ...entry, checked: item.checked } : entry)),
      )
      setActionError(mapPantryApiError(cause))
    }
  }

  async function handleRemove(item: ShoppingItem) {
    setActionError(null)
    const previous = items
    setItems((current) => current.filter((entry) => entry.id !== item.id))
    try {
      await removeShoppingItem(item.id)
    } catch (cause) {
      setItems(previous)
      setActionError(mapPantryApiError(cause))
    }
  }

  async function handleClearCompleted() {
    if (clearing || completed.length === 0) {
      return
    }

    setClearing(true)
    setActionError(null)
    try {
      const result = await clearCompletedShoppingItems()
      setItems(result.list.items)
    } catch (cause) {
      setActionError(mapPantryApiError(cause))
    } finally {
      setClearing(false)
    }
  }

  return (
    <section>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Cumpărături</h1>
          {household ? <p className="mt-1 truncate text-muted">{household.name}</p> : null}
        </div>
        <button
          type="button"
          className="flex min-h-touch shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-medium text-accent"
          onClick={() => setSheet({ type: 'manual' })}
        >
          <Plus className="size-4" aria-hidden="true" />
          Adaugă produs
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="flex h-touch min-h-touch items-center rounded-lg border border-border bg-surface-elevated px-3 text-sm font-medium"
          onClick={() => setSheet({ type: 'products' })}
        >
          Adaugă din produse
        </button>
      </div>

      {items.length > 0 ? (
        <p className="mt-4 text-sm text-muted">
          {remaining.length} de cumpărat · {completed.length} cumpărate
        </p>
      ) : null}

      {status === 'loading' ? (
        <div className="mt-10 flex justify-center text-muted">
          <LoaderCircle className="size-6 animate-spin" aria-label="Se încarcă lista de cumpărături" />
        </div>
      ) : null}

      {status === 'error' ? <p className="mt-8 text-sm text-destructive">{loadError}</p> : null}

      {actionError ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {actionError}
        </p>
      ) : null}

      {empty ? (
        <div className="mt-10 text-center">
          <p className="text-muted">Lista de cumpărături este goală.</p>
          <p className="mt-1 text-sm text-muted">Adaugă produsele de care ai nevoie.</p>
          <button
            type="button"
            className="mt-4 inline-flex h-touch min-h-touch items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground shadow-surface"
            onClick={() => setSheet({ type: 'manual' })}
          >
            Adaugă produs
          </button>
        </div>
      ) : null}

      {status === 'ready' && items.length > 0 ? (
        <ul className="mt-5 space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <ShoppingItemRow
                item={item}
                onToggle={() => void handleToggle(item)}
                onRemove={() => void handleRemove(item)}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {completed.length > 0 ? (
        <button
          type="button"
          disabled={clearing}
          aria-busy={clearing}
          className="mt-5 flex h-touch min-h-touch w-full items-center justify-center rounded-lg border border-border px-3 text-sm font-medium disabled:opacity-60"
          onClick={() => void handleClearCompleted()}
        >
          {clearing ? 'Se șterg...' : 'Șterge produsele cumpărate'}
        </button>
      ) : null}

      {sheet.type === 'manual' ? (
        <ManualItemSheet
          onClose={() => setSheet({ type: 'closed' })}
          onSaved={async (item) => {
            setItems((current) => sortShoppingItems([...current, item]))
            setSheet({ type: 'closed' })
          }}
        />
      ) : null}

      {sheet.type === 'products' ? (
        <ProductSearchSheet
          onClose={() => setSheet({ type: 'closed' })}
          onSaved={async (item) => {
            setItems((current) => upsertShoppingItem(current, item))
            setSheet({ type: 'closed' })
          }}
        />
      ) : null}
    </section>
  )
}

function sortShoppingItems(items: ShoppingItem[]): ShoppingItem[] {
  return [...items].sort((left, right) => {
    if (left.checked !== right.checked) {
      return left.checked ? 1 : -1
    }
    return left.id.localeCompare(right.id)
  })
}

function upsertShoppingItem(items: ShoppingItem[], item: ShoppingItem): ShoppingItem[] {
  const without = items.filter((entry) => entry.id !== item.id)
  if (item.productId) {
    const mergedAway = without.filter(
      (entry) => !(entry.productId === item.productId && !entry.checked && !item.checked),
    )
    return sortShoppingItems([...mergedAway, item])
  }
  return sortShoppingItems([...without, item])
}

function ShoppingItemRow({
  item,
  onToggle,
  onRemove,
}: {
  item: ShoppingItem
  onToggle: () => void
  onRemove: () => void
}) {
  const checkboxId = useId()
  const quantityLabel =
    item.quantity != null && item.unit ? formatQuantity(item.quantity, item.unit) : item.quantity != null
      ? String(item.quantity)
      : item.unit
        ? unitLabel(item.unit)
        : null

  return (
    <article
      className={`flex items-center gap-2 rounded-2xl border border-border bg-surface-elevated px-2 py-1.5 shadow-surface ${
        item.checked ? 'opacity-70' : ''
      }`}
    >
      <label htmlFor={checkboxId} className="flex min-h-touch min-w-touch shrink-0 items-center justify-center">
        <input
          id={checkboxId}
          type="checkbox"
          checked={item.checked}
          onChange={onToggle}
          className="size-6 accent-accent"
          aria-label={item.checked ? `Debifează ${item.name}` : `Bifează ${item.name}`}
        />
      </label>
      <div className="min-w-0 flex-1">
        <p className={`truncate font-medium ${item.checked ? 'text-muted line-through' : 'text-text'}`}>
          {item.name}
        </p>
        {quantityLabel ? (
          <p className={`truncate text-sm ${item.checked ? 'text-muted line-through' : 'text-muted'}`}>
            {quantityLabel}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        className="flex min-h-touch min-w-touch shrink-0 items-center justify-center rounded-lg text-muted"
        aria-label={`Șterge ${item.name}`}
        onClick={onRemove}
      >
        <Trash2 className="size-5" aria-hidden="true" />
      </button>
    </article>
  )
}

function ManualItemSheet({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: (item: ShoppingItem) => Promise<void>
}) {
  const nameId = useId()
  const quantityId = useId()
  const unitId = useId()
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState<'' | Unit>('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) {
      return
    }

    setFormError(null)

    let itemName: string
    try {
      itemName = validateShoppingItemName(name).name
    } catch (error) {
      setFormError(error instanceof DomainError ? PRODUCT_NAME_INVALID_MESSAGE : mapPantryApiError(error))
      return
    }

    let parsedQuantity: number | null = null
    try {
      parsedQuantity = quantity.trim()
        ? validateOptionalShoppingQuantity(Number(quantity.replace(',', '.')))
        : null
    } catch {
      setFormError(QUANTITY_INVALID_MESSAGE)
      return
    }

    let parsedUnit: Unit | null = null
    try {
      parsedUnit = validateOptionalShoppingUnit(unit)
    } catch {
      setFormError('Alege o unitate validă.')
      return
    }

    setIsSubmitting(true)
    try {
      const created = await addShoppingManualItem({
        name: itemName,
        quantity: parsedQuantity,
        unit: parsedUnit,
      })
      await onSaved(created.item)
    } catch (cause) {
      setFormError(mapPantryApiError(cause))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <InventorySheet title="Adaugă produs" onClose={onClose}>
      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        <div>
          <label className="text-sm font-medium" htmlFor={nameId}>
            Produs
          </label>
          <input
            id={nameId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={isSubmitting}
            required
            maxLength={120}
            className={fieldClassName}
            placeholder="Hârtie de bucătărie"
          />
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor={quantityId}>
            Cantitate (opțional)
          </label>
          <input
            id={quantityId}
            inputMode="decimal"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            disabled={isSubmitting}
            className={fieldClassName}
            placeholder="2"
          />
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor={unitId}>
            Unitate (opțional)
          </label>
          <select
            id={unitId}
            value={unit}
            onChange={(event) => setUnit(event.target.value as '' | Unit)}
            disabled={isSubmitting}
            className={fieldClassName}
          >
            <option value="">Fără unitate</option>
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
          {isSubmitting ? 'Se adaugă...' : 'Adaugă'}
        </button>
      </form>
    </InventorySheet>
  )
}

function ProductSearchSheet({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: (item: ShoppingItem) => Promise<void>
}) {
  const searchId = useId()
  const quantityId = useId()
  const unitId = useId()
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [products, setProducts] = useState<ProductRecord[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<ProductRecord | null>(null)
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState<Unit>('package')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [addingProductId, setAddingProductId] = useState<string | null>(null)

  useEffect(() => {
    const handle = window.setTimeout(() => setSearch(searchInput.trim()), 250)
    return () => window.clearTimeout(handle)
  }, [searchInput])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setStatus('loading')
      setLoadError(null)
      try {
        const result = await getProducts(search)
        if (!cancelled) {
          setProducts(result.products)
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
  }, [search])

  async function addProduct(product: ProductRecord, nextQuantity: number, nextUnit: Unit) {
    const created = await addShoppingProductItem({
      productId: product.id,
      quantity: nextQuantity,
      unit: nextUnit,
    })
    await onSaved(created.item)
  }

  async function handleSelect(product: ProductRecord) {
    if (isSubmitting || addingProductId) {
      return
    }

    const suggestion = suggestShoppingQuantity(product)
    if (suggestion) {
      setAddingProductId(product.id)
      setFormError(null)
      try {
        await addProduct(product, suggestion.quantity, suggestion.unit)
      } catch (cause) {
        setFormError(mapPantryApiError(cause))
      } finally {
        setAddingProductId(null)
      }
      return
    }

    setSelected(product)
    setQuantity('')
    setUnit(product.unit)
    setFormError(null)
  }

  async function handleConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || isSubmitting) {
      return
    }

    setFormError(null)
    let parsedQuantity: number
    try {
      parsedQuantity = Number(quantity.replace(',', '.'))
      if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
        throw new Error('invalid')
      }
    } catch {
      setFormError(QUANTITY_INVALID_MESSAGE)
      return
    }

    setIsSubmitting(true)
    try {
      await addProduct(selected, parsedQuantity, unit)
    } catch (cause) {
      setFormError(mapPantryApiError(cause))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <InventorySheet title={selected ? `Cantitate · ${selected.name}` : 'Adaugă din produse'} onClose={onClose}>
      {selected ? (
        <form className="flex flex-col gap-3" onSubmit={handleConfirm}>
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
            {isSubmitting ? 'Se adaugă...' : 'Adaugă'}
          </button>
        </form>
      ) : (
        <div>
          <label className="sr-only" htmlFor={searchId}>
            Caută produse
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <input
              id={searchId}
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Caută produse"
              className={`${fieldClassName} mt-0 pl-9`}
            />
          </div>
          {status === 'loading' ? (
            <div className="mt-6 flex justify-center text-muted">
              <LoaderCircle className="size-5 animate-spin" aria-label="Se caută produse" />
            </div>
          ) : null}
          {status === 'error' ? <p className="mt-4 text-sm text-destructive">{loadError}</p> : null}
          {formError ? (
            <p className="mt-4 text-sm text-destructive" role="alert">
              {formError}
            </p>
          ) : null}
          {status === 'ready' && products.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Niciun produs găsit.</p>
          ) : null}
          {status === 'ready' && products.length > 0 ? (
            <ul className="mt-4 space-y-1">
              {products.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    disabled={addingProductId !== null}
                    className="flex min-h-touch w-full items-center justify-between gap-3 rounded-lg px-2 text-left disabled:opacity-60"
                    onClick={() => void handleSelect(product)}
                  >
                    <span className="min-w-0 truncate font-medium">{product.name}</span>
                    <span className="shrink-0 text-sm text-muted">{unitLabel(product.unit, 1)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </InventorySheet>
  )
}
