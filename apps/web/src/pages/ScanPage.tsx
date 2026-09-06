import {
  DomainError,
  validateBarcode,
  validateProductName,
  validateQuantity,
  type ExternalCatalogId,
  type LocationRecord,
  type ProductNutrition,
  type ProductRecord,
  type Unit,
} from '@pantry/core'
import { LoaderCircle } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { InventorySheet } from '../components/inventory/InventorySheet'
import { BarcodeScanner } from '../components/scan/BarcodeScanner'
import { ProductImage } from '../components/scan/ProductImage'
import { useHousehold } from '../household/HouseholdProvider'
import { isPantryApiError } from '../lib/api'
import { formatKcal100g, formatMacroLine, unitLabel } from '../lib/inventory-format'
import {
  CATALOG_UNAVAILABLE_MESSAGE,
  PRODUCT_NAME_INVALID_MESSAGE,
  QUANTITY_INVALID_MESSAGE,
  mapPantryApiError,
} from '../lib/pantry-api-error'
import {
  addStock,
  createProduct,
  importBarcode,
  lookupBarcode,
  type ExternalBarcodeProduct,
} from '../lib/pantry-api'

const fieldClassName =
  'mt-1.5 h-touch min-h-touch w-full rounded-lg border border-border bg-surface px-3 text-text shadow-surface placeholder:text-muted disabled:opacity-60'

const UNIT_OPTIONS: Array<{ value: Unit; label: string }> = [
  { value: 'g', label: 'g' },
  { value: 'ml', label: 'ml' },
  { value: 'each', label: 'buc' },
  { value: 'package', label: 'pachet' },
]

type ScanView =
  | { phase: 'idle' }
  | { phase: 'camera' }
  | { phase: 'lookup'; barcode: string }
  | { phase: 'existing'; barcode: string; product: ProductRecord }
  | { phase: 'external'; barcode: string; product: ExternalBarcodeProduct; importedId?: string }
  | { phase: 'not_found'; barcode: string; createdProductId?: string }
  | { phase: 'unavailable'; barcode: string }

export function ScanPage() {
  const navigate = useNavigate()
  const { locations } = useHousehold()
  const [view, setView] = useState<ScanView>({ phase: 'camera' })
  const [manualOpen, setManualOpen] = useState(false)

  async function lookup(barcode: string) {
    setView({ phase: 'lookup', barcode })
    try {
      const result = await lookupBarcode(barcode)
      if (result.status === 'existing') {
        setView({ phase: 'existing', barcode, product: result.product })
        return
      }
      if (result.status === 'external') {
        setView({ phase: 'external', barcode, product: result.product })
        return
      }
      setView({ phase: 'not_found', barcode: result.barcode })
    } catch (cause) {
      if (isPantryApiError(cause) && cause.code === 'CATALOG_UNAVAILABLE') {
        setView({ phase: 'unavailable', barcode })
        return
      }
      setView({ phase: 'unavailable', barcode })
    }
  }

  const fridgeId = locations.find((location) => location.name === 'Frigider')?.id ?? locations[0]?.id ?? ''

  return (
    <section>
      {view.phase === 'camera' ? (
        <BarcodeScanner
          onDetected={(barcode) => void lookup(barcode)}
          onClose={() => setView({ phase: 'idle' })}
          onManual={() => {
            setView({ phase: 'idle' })
            setManualOpen(true)
          }}
        />
      ) : null}

      {view.phase === 'idle' ? (
        <IdleScan
          onScan={() => setView({ phase: 'camera' })}
          onManual={() => setManualOpen(true)}
        />
      ) : null}

      {view.phase === 'lookup' ? (
        <div className="mt-16 flex flex-col items-center text-muted">
          <LoaderCircle className="size-6 animate-spin" aria-label="Se caută produsul" />
          <p className="mt-3 text-sm">Căutăm {view.barcode}…</p>
        </div>
      ) : null}

      {view.phase === 'unavailable' ? (
        <UnavailableScan
          barcode={view.barcode}
          onRetry={() => void lookup(view.barcode)}
          onManual={() => setManualOpen(true)}
          onRescan={() => setView({ phase: 'camera' })}
        />
      ) : null}

      {view.phase === 'existing' ? (
        <ExistingProductScan
          product={view.product}
          locations={locations}
          defaultLocationId={fridgeId}
          onSaved={() => navigate('/inventory')}
          onRescan={() => setView({ phase: 'camera' })}
        />
      ) : null}

      {view.phase === 'external' ? (
        <ExternalProductScan
          barcode={view.barcode}
          preview={view.product}
          importedId={view.importedId}
          locations={locations}
          defaultLocationId={fridgeId}
          onImported={(productId) =>
            setView({ phase: 'external', barcode: view.barcode, product: view.product, importedId: productId })
          }
          onSaved={() => navigate('/inventory')}
          onRescan={() => setView({ phase: 'camera' })}
        />
      ) : null}

      {view.phase === 'not_found' ? (
        <UnknownProductScan
          barcode={view.barcode}
          createdProductId={view.createdProductId}
          locations={locations}
          defaultLocationId={fridgeId}
          onCreated={(productId) => setView({ phase: 'not_found', barcode: view.barcode, createdProductId: productId })}
          onSaved={() => navigate('/inventory')}
          onRescan={() => setView({ phase: 'camera' })}
        />
      ) : null}

      {manualOpen ? (
        <ManualBarcodeSheet
          onClose={() => setManualOpen(false)}
          onSearch={(barcode) => {
            setManualOpen(false)
            void lookup(barcode)
          }}
        />
      ) : null}
    </section>
  )
}

function IdleScan({ onScan, onManual }: { onScan: () => void; onManual: () => void }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Scan</h1>
      <p className="mt-2 text-muted">Centrează un cod de bare sau introdu-l manual.</p>
      <button
        type="button"
        onClick={onScan}
        className="mt-6 flex h-touch min-h-touch w-full items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground"
      >
        Scanează din nou
      </button>
      <button
        type="button"
        onClick={onManual}
        className="mt-3 flex h-touch min-h-touch w-full items-center justify-center rounded-lg border border-border px-4 text-sm font-medium"
      >
        Introdu codul manual
      </button>
    </div>
  )
}

function UnavailableScan({
  barcode,
  onRetry,
  onManual,
  onRescan,
}: {
  barcode: string
  onRetry: () => void
  onManual: () => void
  onRescan: () => void
}) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Scan</h1>
      <p className="mt-3 text-sm">{CATALOG_UNAVAILABLE_MESSAGE}</p>
      <p className="mt-1 text-sm text-muted">{barcode}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 flex h-touch min-h-touch w-full items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground"
      >
        Încearcă din nou
      </button>
      <button
        type="button"
        onClick={onRescan}
        className="mt-3 flex h-touch min-h-touch w-full items-center justify-center rounded-lg border border-border px-4 text-sm font-medium"
      >
        Scanează din nou
      </button>
      <button
        type="button"
        onClick={onManual}
        className="mt-3 flex h-touch min-h-touch w-full items-center justify-center rounded-lg border border-border px-4 text-sm font-medium"
      >
        Introdu codul manual
      </button>
    </div>
  )
}

function catalogLabel(catalog: ExternalCatalogId) {
  return catalog === 'open_products_facts' ? 'Open Products Facts' : 'Open Food Facts'
}

function catalogUrl(catalog: ExternalCatalogId, barcode: string) {
  const host =
    catalog === 'open_products_facts' ? 'https://world.openproductsfacts.org' : 'https://world.openfoodfacts.org'
  return `${host}/product/${encodeURIComponent(barcode)}`
}

function NutritionBlock({ nutrition }: { nutrition: ProductNutrition | null }) {
  if (!nutrition) {
    return null
  }

  const kcal = nutrition.energyKcal100g
  const macros = formatMacroLine(nutrition)
  if (kcal == null && !macros) {
    return null
  }

  return (
    <div className="mt-3 rounded-xl bg-surface px-3 py-2 text-sm">
      <p className="font-medium">Valori nutriționale / 100 g</p>
      {kcal != null ? <p className="mt-1">{formatKcal100g(kcal)}</p> : null}
      {macros ? <p className="mt-1 text-muted">{macros}</p> : null}
    </div>
  )
}

function ExistingProductScan({
  product,
  locations,
  defaultLocationId,
  onSaved,
  onRescan,
}: {
  product: ProductRecord
  locations: LocationRecord[]
  defaultLocationId: string
  onSaved: () => Promise<void> | void
  onRescan: () => void
}) {
  return (
    <div>
      <ProductSummary
        name={product.name}
        brand={product.brand}
        barcode={product.barcode}
        imageUrl={product.imageUrl}
        catalog={product.externalCatalog}
        nutrition={product.nutrition}
      />
      <StockForm
        productId={product.id}
        unit={product.unit}
        suggestedQuantity={null}
        locations={locations}
        defaultLocationId={defaultLocationId}
        onSaved={onSaved}
      />
      <button type="button" onClick={onRescan} className="mt-3 w-full text-sm text-muted">
        Scanează alt produs
      </button>
    </div>
  )
}

function ExternalProductScan({
  barcode,
  preview,
  importedId,
  locations,
  defaultLocationId,
  onImported,
  onSaved,
  onRescan,
}: {
  barcode: string
  preview: ExternalBarcodeProduct
  importedId?: string
  locations: LocationRecord[]
  defaultLocationId: string
  onImported: (productId: string) => void
  onSaved: () => Promise<void> | void
  onRescan: () => void
}) {
  const displayName = preview.name?.trim() || preview.brand?.trim() || `Produs ${barcode}`

  async function ensureImported(): Promise<string> {
    if (importedId) {
      return importedId
    }

    const imported = await importBarcode(barcode)
    onImported(imported.product.id)
    return imported.product.id
  }

  return (
    <div>
      <ProductSummary
        name={displayName}
        brand={preview.brand}
        barcode={barcode}
        imageUrl={preview.imageUrl}
        catalog={preview.catalog}
        quantityText={preview.quantityText}
        nutrition={preview.nutrition}
      />
      <StockForm
        productId={importedId ?? null}
        unit={preview.unit}
        suggestedQuantity={preview.packageQuantityConfident ? preview.packageQuantity : null}
        locations={locations}
        defaultLocationId={defaultLocationId}
        resolveProductId={ensureImported}
        onSaved={onSaved}
      />
      <button type="button" onClick={onRescan} className="mt-3 w-full text-sm text-muted">
        Scanează alt produs
      </button>
    </div>
  )
}

function UnknownProductScan({
  barcode,
  createdProductId,
  locations,
  defaultLocationId,
  onCreated,
  onSaved,
  onRescan,
}: {
  barcode: string
  createdProductId?: string
  locations: LocationRecord[]
  defaultLocationId: string
  onCreated: (productId: string) => void
  onSaved: () => Promise<void> | void
  onRescan: () => void
}) {
  const nameId = useId()
  const brandId = useId()
  const unitId = useId()
  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [unit, setUnit] = useState<Unit>('package')
  const locked = createdProductId != null

  async function ensureCreated(): Promise<string> {
    if (createdProductId) {
      return createdProductId
    }

    let productName: string
    try {
      productName = validateProductName(name).name
    } catch {
      throw new DomainError('INVALID_PRODUCT_NAME', PRODUCT_NAME_INVALID_MESSAGE)
    }

    const created = await createProduct({
      name: productName,
      brand: brand.trim() || undefined,
      unit,
      barcode,
    })
    onCreated(created.product.id)
    return created.product.id
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Produsul nu a fost găsit.</h1>
      <p className="mt-2 text-sm text-muted">
        Îl poți adăuga manual și Pantry va recunoaște codul data viitoare.
      </p>
      <p className="mt-2 text-sm">Cod de bare: {barcode}</p>
      {locked ? (
        <p className="mt-3 text-sm text-warning">
          Produsul a fost creat, dar stocul nu s-a salvat. Completează cantitatea și încearcă din nou.
        </p>
      ) : null}
      <div className="mt-4 flex flex-col gap-3">
        <div>
          <label className="text-sm font-medium" htmlFor={nameId}>
            Produs
          </label>
          <input
            id={nameId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={locked}
            required
            maxLength={120}
            className={fieldClassName}
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
            disabled={locked}
            maxLength={80}
            className={fieldClassName}
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
            disabled={locked}
            className={fieldClassName}
          >
            {UNIT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <StockForm
        productId={createdProductId ?? null}
        unit={unit}
        suggestedQuantity={null}
        locations={locations}
        defaultLocationId={defaultLocationId}
        resolveProductId={ensureCreated}
        submitLabel="Adaugă produsul"
        onSaved={onSaved}
        validateBeforeCreate={() => {
          try {
            validateProductName(name)
            return null
          } catch {
            return PRODUCT_NAME_INVALID_MESSAGE
          }
        }}
      />
      <button type="button" onClick={onRescan} className="mt-3 w-full text-sm text-muted">
        Scanează alt produs
      </button>
    </div>
  )
}

function ProductSummary({
  name,
  brand,
  barcode,
  imageUrl,
  catalog,
  quantityText,
  nutrition,
}: {
  name: string
  brand: string | null
  barcode: string | null
  imageUrl: string | null
  catalog: ExternalCatalogId | null
  quantityText?: string | null
  nutrition: ProductNutrition | null
}) {
  return (
    <div>
      <div className="flex items-start gap-3">
        <ProductImage url={imageUrl} name={name} />
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
          {brand ? <p className="mt-1 text-sm text-muted">{brand}</p> : null}
          {barcode ? <p className="mt-1 text-sm text-muted">{barcode}</p> : null}
          {quantityText ? <p className="mt-1 text-sm text-muted">{quantityText}</p> : null}
          {catalog ? (
            <p className="mt-2 text-xs text-muted">
              Date:{' '}
              {barcode ? (
                <a
                  href={catalogUrl(catalog, barcode)}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {catalogLabel(catalog)}
                </a>
              ) : (
                catalogLabel(catalog)
              )}
            </p>
          ) : null}
        </div>
      </div>
      <NutritionBlock nutrition={nutrition} />
    </div>
  )
}

function StockForm({
  productId,
  unit,
  suggestedQuantity,
  locations,
  defaultLocationId,
  resolveProductId,
  submitLabel = 'Adaugă în inventar',
  validateBeforeCreate,
  onSaved,
}: {
  productId: string | null
  unit: Unit
  suggestedQuantity: number | null
  locations: LocationRecord[]
  defaultLocationId: string
  resolveProductId?: () => Promise<string>
  submitLabel?: string
  validateBeforeCreate?: () => string | null
  onSaved: () => Promise<void> | void
}) {
  const quantityId = useId()
  const locationIdField = useId()
  const expiryId = useId()
  const [quantity, setQuantity] = useState(
    suggestedQuantity != null ? String(suggestedQuantity) : '',
  )
  const [locationId, setLocationId] = useState(defaultLocationId)
  const [expiresOn, setExpiresOn] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [resolvedId, setResolvedId] = useState(productId)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) {
      return
    }

    setFormError(null)
    if (!resolvedId && validateBeforeCreate) {
      const validationError = validateBeforeCreate()
      if (validationError) {
        setFormError(validationError)
        return
      }
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
      let id = resolvedId
      if (!id) {
        if (!resolveProductId) {
          throw new Error('missing product')
        }
        id = await resolveProductId()
        setResolvedId(id)
      }

      await addStock({
        productId: id,
        locationId,
        quantity: parsedQuantity,
        expiresOn: expiresOn.trim() || null,
      })
      await onSaved()
    } catch (cause) {
      if (cause instanceof DomainError && cause.code === 'INVALID_PRODUCT_NAME') {
        setFormError(PRODUCT_NAME_INVALID_MESSAGE)
      } else {
        setFormError(mapPantryApiError(cause))
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="mt-5 flex flex-col gap-3" onSubmit={handleSubmit}>
      <div>
        <label className="text-sm font-medium" htmlFor={quantityId}>
          Cantitate ({unitLabel(unit)})
        </label>
        <input
          id={quantityId}
          inputMode="decimal"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          disabled={isSubmitting}
          required
          className={fieldClassName}
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
        {isSubmitting ? 'Se salvează...' : submitLabel}
      </button>
    </form>
  )
}

function ManualBarcodeSheet({
  onClose,
  onSearch,
}: {
  onClose: () => void
  onSearch: (barcode: string) => void
}) {
  const barcodeId = useId()
  const [barcode, setBarcode] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      onSearch(validateBarcode(barcode))
    } catch {
      setError('Introdu un cod de bare valid.')
    }
  }

  return (
    <InventorySheet title="Cod de bare" onClose={onClose}>
      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        <div>
          <label className="text-sm font-medium" htmlFor={barcodeId}>
            Cod de bare
          </label>
          <input
            id={barcodeId}
            inputMode="numeric"
            autoComplete="off"
            value={barcode}
            onChange={(event) => setBarcode(event.target.value)}
            className={fieldClassName}
            placeholder="3017620422003"
          />
        </div>
        <div role="alert" className="min-h-5 text-sm text-destructive">
          {error}
        </div>
        <button
          type="submit"
          className="flex h-touch min-h-touch w-full items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground"
        >
          Caută produsul
        </button>
      </form>
    </InventorySheet>
  )
}
