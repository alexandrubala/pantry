import {
  lotQuickAddStep,
  validateNonNegativeQuantity,
  validateQuantity,
  type InventoryItem,
  type InventoryLotRecord,
} from '@pantry/core'
import { LoaderCircle, Pencil, Plus } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { InventorySheet } from './InventorySheet'
import {
  formatLotExpiryLine,
  formatQuantity,
  lotPlusButtonLabel,
  unitLabel,
} from '../../lib/inventory-format'
import { QUANTITY_INVALID_MESSAGE, mapPantryApiError } from '../../lib/pantry-api-error'
import { addStock, updateLot } from '../../lib/pantry-api'

const fieldClassName =
  'mt-1.5 h-touch min-h-touch w-full rounded-lg border border-border bg-surface px-3 text-text shadow-surface placeholder:text-muted disabled:opacity-60'

export function LotsSheet({
  item,
  locations,
  today,
  onClose,
  onSaved,
}: {
  item: InventoryItem
  locations: Array<{ id: string; name: string }>
  today: string
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [editing, setEditing] = useState<InventoryLotRecord | null>(null)
  const [addingExpiry, setAddingExpiry] = useState(false)
  const [addingToLot, setAddingToLot] = useState<InventoryLotRecord | null>(null)
  const [plusError, setPlusError] = useState<string | null>(null)
  const [plusBusyId, setPlusBusyId] = useState<string | null>(null)

  async function handleQuickPlus(lot: InventoryLotRecord) {
    if (plusBusyId) {
      return
    }

    const step = lotQuickAddStep(item.product)
    if (!step) {
      setAddingToLot(lot)
      return
    }

    setPlusError(null)
    setPlusBusyId(lot.id)
    try {
      await addStock({
        productId: item.product.id,
        locationId: lot.locationId,
        quantity: step.quantity,
        expiresOn: lot.expiresOn,
      })
      await onSaved()
    } catch (cause) {
      setPlusError(mapPantryApiError(cause))
    } finally {
      setPlusBusyId(null)
    }
  }

  return (
    <>
      <InventorySheet title={`Loturi · ${item.product.name}`} onClose={onClose}>
        {item.lots.length === 0 ? <p className="text-sm text-muted">Nu există loturi.</p> : null}
        <ul className="space-y-2">
          {item.lots.map((lot) => {
            const plusStep = lotQuickAddStep(item.product)
            return (
            <li key={lot.id} className="rounded-xl border border-border px-3 py-3">
              <p className="font-medium">{formatQuantity(lot.quantity, item.product.unit)}</p>
              <p className="mt-0.5 text-sm text-muted">{lot.locationName}</p>
              <p className="mt-0.5 text-sm text-muted">{formatLotExpiryLine(lot.expiresOn, today)}</p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={plusBusyId != null}
                  className="flex h-touch min-h-touch flex-1 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium disabled:opacity-60"
                  onClick={() => void handleQuickPlus(lot)}
                  aria-label={lotPlusButtonLabel(item)}
                >
                  {plusBusyId === lot.id ? (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Plus className="size-4" aria-hidden="true" />
                  )}
                  {plusStep?.asPackage ? (
                    <span className="ml-1.5">
                      1 pachet ({formatQuantity(plusStep.quantity, item.product.unit)})
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  className="flex h-touch min-h-touch min-w-touch items-center justify-center rounded-lg border border-border px-3 text-sm font-medium"
                  onClick={() => setEditing(lot)}
                  aria-label="Editează lotul"
                >
                  <Pencil className="size-4" aria-hidden="true" />
                </button>
              </div>
            </li>
            )
          })}
        </ul>
        {plusError ? (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {plusError}
          </p>
        ) : null}
        <button
          type="button"
          className="mt-4 flex h-touch min-h-touch w-full items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-medium"
          onClick={() => setAddingExpiry(true)}
        >
          <Plus className="size-4" aria-hidden="true" />
          Altă dată de expirare
        </button>
      </InventorySheet>

      {editing ? (
        <EditLotSheet
          item={item}
          lot={editing}
          locations={locations}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await onSaved()
          }}
        />
      ) : null}

      {addingExpiry ? (
        <AddExpiryLotSheet
          item={item}
          locations={locations}
          defaultLocationId={item.lots[0]?.locationId ?? locations[0]?.id ?? ''}
          onClose={() => setAddingExpiry(false)}
          onSaved={async () => {
            setAddingExpiry(false)
            await onSaved()
          }}
        />
      ) : null}

      {addingToLot ? (
        <AddToLotSheet
          item={item}
          lot={addingToLot}
          onClose={() => setAddingToLot(null)}
          onSaved={async () => {
            setAddingToLot(null)
            await onSaved()
          }}
        />
      ) : null}
    </>
  )
}

function EditLotSheet({
  item,
  lot,
  locations,
  onClose,
  onSaved,
}: {
  item: InventoryItem
  lot: InventoryLotRecord
  locations: Array<{ id: string; name: string }>
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const quantityId = useId()
  const locationIdField = useId()
  const expiryId = useId()
  const confirmId = useId()
  const [quantity, setQuantity] = useState(String(lot.quantity))
  const [locationId, setLocationId] = useState(lot.locationId)
  const [expiresOn, setExpiresOn] = useState(lot.expiresOn ?? '')
  const [confirmRemove, setConfirmRemove] = useState(false)
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
      parsed = validateNonNegativeQuantity(Number(quantity.replace(',', '.')))
    } catch {
      setFormError(QUANTITY_INVALID_MESSAGE)
      return
    }

    if (parsed === 0 && !confirmRemove) {
      setFormError('Acest lot va fi eliminat din inventar.')
      return
    }

    setIsSubmitting(true)
    try {
      await updateLot({
        lotId: lot.id,
        expected: {
          quantity: lot.quantity,
          locationId: lot.locationId,
          expiresOn: lot.expiresOn,
        },
        quantity: parsed,
        locationId,
        expiresOn: expiresOn.trim() || null,
      })
      await onSaved()
    } catch (cause) {
      setFormError(mapPantryApiError(cause))
    } finally {
      setIsSubmitting(false)
    }
  }

  const parsedQuantity = Number(quantity.replace(',', '.'))
  const willRemove = Number.isFinite(parsedQuantity) && parsedQuantity === 0

  return (
    <InventorySheet title="Editează lotul" onClose={onClose}>
      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        <div>
          <label className="text-sm font-medium" htmlFor={quantityId}>
            Cantitate
          </label>
          <div className="flex items-center gap-2">
            <input
              id={quantityId}
              inputMode="decimal"
              value={quantity}
              onChange={(event) => {
                setQuantity(event.target.value)
                setConfirmRemove(false)
              }}
              disabled={isSubmitting}
              className={fieldClassName}
            />
            <span className="mt-1.5 shrink-0 text-sm text-muted">{unitLabel(item.product.unit)}</span>
          </div>
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
            Data expirării
          </label>
          <input
            id={expiryId}
            type="date"
            value={expiresOn}
            onChange={(event) => setExpiresOn(event.target.value)}
            disabled={isSubmitting}
            className={fieldClassName}
          />
          <p className="mt-1 text-sm text-muted">Lasă gol pentru fără dată de expirare.</p>
        </div>
        {willRemove ? (
          <label className="flex items-start gap-2 text-sm" htmlFor={confirmId}>
            <input
              id={confirmId}
              type="checkbox"
              checked={confirmRemove}
              onChange={(event) => setConfirmRemove(event.target.checked)}
              className="mt-1"
            />
            <span>Acest lot va fi eliminat din inventar.</span>
          </label>
        ) : null}
        <div role="alert" className="min-h-5 text-sm text-destructive">
          {formError}
        </div>
        <button
          type="submit"
          disabled={isSubmitting || (willRemove && !confirmRemove)}
          className="flex h-touch min-h-touch w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground disabled:opacity-60"
        >
          {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
          {isSubmitting ? 'Se salvează...' : willRemove ? 'Elimină lotul' : 'Salvează'}
        </button>
      </form>
    </InventorySheet>
  )
}

function AddExpiryLotSheet({
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
    let parsed: number
    try {
      parsed = validateQuantity(Number(quantity.replace(',', '.')))
    } catch {
      setFormError(QUANTITY_INVALID_MESSAGE)
      return
    }

    setIsSubmitting(true)
    try {
      await addStock({
        productId: item.product.id,
        locationId,
        quantity: parsed,
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
    <InventorySheet title="Altă dată de expirare" onClose={onClose}>
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
        <div role="alert" className="min-h-5 text-sm text-destructive">
          {formError}
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex h-touch min-h-touch w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground disabled:opacity-60"
        >
          {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
          {isSubmitting ? 'Se salvează...' : 'Adaugă lot'}
        </button>
      </form>
    </InventorySheet>
  )
}

function AddToLotSheet({
  item,
  lot,
  onClose,
  onSaved,
}: {
  item: InventoryItem
  lot: InventoryLotRecord
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
    let parsed: number
    try {
      parsed = validateQuantity(Number(quantity.replace(',', '.')))
    } catch {
      setFormError(QUANTITY_INVALID_MESSAGE)
      return
    }

    setIsSubmitting(true)
    try {
      await addStock({
        productId: item.product.id,
        locationId: lot.locationId,
        quantity: parsed,
        expiresOn: lot.expiresOn,
      })
      await onSaved()
    } catch (cause) {
      setFormError(mapPantryApiError(cause))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <InventorySheet title="Adaugă în acest lot" onClose={onClose}>
      <p className="mb-3 text-sm text-muted">
        {lot.locationName} · {formatLotExpiryLine(lot.expiresOn)}
      </p>
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
          />
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
          {isSubmitting ? 'Se salvează...' : 'Adaugă'}
        </button>
      </form>
    </InventorySheet>
  )
}
