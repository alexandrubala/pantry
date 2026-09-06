import {
  consumePercentQuantity,
  validateQuantity,
  type ConsumePercent,
  type InventoryItem,
} from '@pantry/core'
import { LoaderCircle } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { isPantryApiError } from '../../lib/api'
import { formatQuantity, unitLabel } from '../../lib/inventory-format'
import { QUANTITY_INVALID_MESSAGE, insufficientStockMessage, mapPantryApiError } from '../../lib/pantry-api-error'
import { consumeStock } from '../../lib/pantry-api'
import { InventorySheet } from './InventorySheet'

const fieldClassName =
  'mt-1.5 h-touch min-h-touch w-full rounded-lg border border-border bg-surface px-3 text-text shadow-surface placeholder:text-muted disabled:opacity-60'

const PRESETS: ConsumePercent[] = [25, 50, 75]

export function ConsumeSheet({
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
  const [exactOpen, setExactOpen] = useState(false)
  const [confirmAll, setConfirmAll] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const unit = item.product.unit

  async function submit(parsedQuantity: number) {
    if (isSubmitting) {
      return
    }

    setFormError(null)
    if (parsedQuantity > item.totalQuantity) {
      setFormError(insufficientStockMessage(formatQuantity(item.totalQuantity, unit)))
      return
    }

    setIsSubmitting(true)
    try {
      await consumeStock({ productId: item.product.id, quantity: parsedQuantity })
      await onSaved()
    } catch (cause) {
      if (isPantryApiError(cause) && cause.code === 'INSUFFICIENT_STOCK') {
        const available = cause.available ?? item.totalQuantity
        setFormError(insufficientStockMessage(formatQuantity(available, unit)))
      } else {
        setFormError(mapPantryApiError(cause))
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleExact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    let parsedQuantity: number
    try {
      parsedQuantity = validateQuantity(Number(quantity.replace(',', '.')))
    } catch {
      setFormError(QUANTITY_INVALID_MESSAGE)
      return
    }
    await submit(parsedQuantity)
  }

  return (
    <InventorySheet title="Cât ai consumat?" onClose={onClose}>
      <p className="text-sm font-medium">{item.product.name}</p>
      <p className="mt-1 text-sm text-muted">Disponibil: {formatQuantity(item.totalQuantity, unit)}</p>

      {confirmAll ? (
        <div className="mt-4">
          <p className="text-sm">Vei consuma tot stocul disponibil pentru acest produs.</p>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              disabled={isSubmitting}
              className="flex h-touch min-h-touch items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground disabled:opacity-60"
              onClick={() => void submit(item.totalQuantity)}
            >
              {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
              Consumă tot
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              className="flex h-touch min-h-touch items-center justify-center rounded-lg border border-border px-4 text-sm font-medium"
              onClick={() => setConfirmAll(false)}
            >
              Anulează
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {PRESETS.map((percent) => {
              const amount =
                item.totalQuantity > 0 ? consumePercentQuantity(item.totalQuantity, percent, unit) : 0
              return (
                <button
                  key={percent}
                  type="button"
                  disabled={isSubmitting || item.totalQuantity <= 0}
                  className="flex min-h-touch flex-col items-center justify-center rounded-xl border border-border px-3 py-3 text-sm font-medium disabled:opacity-60"
                  onClick={() => void submit(amount)}
                >
                  <span>{percent}%</span>
                  <span className="mt-1 text-xs font-normal text-muted">{formatQuantity(amount, unit)}</span>
                </button>
              )
            })}
            <button
              type="button"
              disabled={isSubmitting || item.totalQuantity <= 0}
              className="flex min-h-touch flex-col items-center justify-center rounded-xl border border-border px-3 py-3 text-sm font-medium disabled:opacity-60"
              onClick={() => setConfirmAll(true)}
            >
              <span>Tot</span>
              <span className="mt-1 text-xs font-normal text-muted">
                {formatQuantity(item.totalQuantity, unit)}
              </span>
            </button>
          </div>

          <button
            type="button"
            className="mt-4 w-full text-sm font-medium text-accent"
            onClick={() => setExactOpen((current) => !current)}
          >
            Cantitate exactă
          </button>

          {exactOpen ? (
            <form className="mt-3 flex flex-col gap-3" onSubmit={(event) => void handleExact(event)}>
              <div>
                <label className="text-sm font-medium" htmlFor={quantityId}>
                  Cantitate
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id={quantityId}
                    inputMode="decimal"
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                    disabled={isSubmitting}
                    required
                    className={fieldClassName}
                    placeholder={`250`}
                  />
                  <span className="mt-1.5 shrink-0 text-sm text-muted">{unitLabel(unit)}</span>
                </div>
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex h-touch min-h-touch w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground disabled:opacity-60"
              >
                {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
                Consumă
              </button>
            </form>
          ) : null}
        </>
      )}

      <div role="alert" aria-live="assertive" className="mt-3 min-h-5 text-sm text-destructive">
        {formError}
      </div>
    </InventorySheet>
  )
}
