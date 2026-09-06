import type { InventoryItem } from '@pantry/core'
import { ProductImage } from '../scan/ProductImage'
import {
  formatExpiryHeadline,
  formatKcal100g,
  formatLotExpiry,
  formatMacroLine,
  formatQuantity,
  isExpirySoon,
} from '../../lib/inventory-format'

export function InventoryProductCard({
  item,
  onAddStock,
  onConsume,
  onAddToShopping,
  shoppingBusy = false,
}: {
  item: InventoryItem
  onAddStock: () => void
  onConsume: () => void
  onAddToShopping: () => void
  shoppingBusy?: boolean
}) {
  const expirySoon = item.nearestExpiry ? isExpirySoon(item.nearestExpiry) : false
  const nutrition = item.product.nutrition
  const kcal = nutrition?.energyKcal100g
  const macros = nutrition ? formatMacroLine(nutrition) : null

  return (
    <article className="rounded-2xl border border-border bg-surface-elevated p-4 shadow-surface">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <ProductImage url={item.product.imageUrl} name={item.product.name} sizeClassName="size-14" />
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight">{item.product.name}</h2>
            {item.product.brand ? <p className="mt-0.5 text-sm text-muted">{item.product.brand}</p> : null}
          </div>
        </div>
        <p className="shrink-0 text-base font-medium">{formatQuantity(item.totalQuantity, item.product.unit)}</p>
      </div>

      {kcal != null ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm text-muted">{formatKcal100g(kcal)}</summary>
          {macros ? <p className="mt-1 text-sm text-muted">{macros}</p> : null}
        </details>
      ) : null}

      {item.nearestExpiry ? (
        <p className={`mt-2 text-sm ${expirySoon ? 'font-medium text-warning' : 'text-muted'}`}>
          {formatExpiryHeadline(item.nearestExpiry)}
        </p>
      ) : null}

      <ul className="mt-3 space-y-1.5">
        {item.lots.map((lot) => (
          <li key={lot.id} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-text">{lot.locationName}</span>
            <span className="shrink-0 text-muted">
              {formatQuantity(lot.quantity, item.product.unit)} · {formatLotExpiry(lot.expiresOn)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          className="flex h-touch min-h-touch items-center justify-center rounded-lg border border-border px-3 text-sm font-medium"
          onClick={onAddStock}
        >
          Adaugă stoc
        </button>
        <button
          type="button"
          className="flex h-touch min-h-touch items-center justify-center rounded-lg bg-accent px-3 text-sm font-medium text-accent-foreground"
          onClick={onConsume}
        >
          Consumă
        </button>
        <button
          type="button"
          disabled={shoppingBusy}
          className="col-span-2 flex h-touch min-h-touch items-center justify-center rounded-lg border border-border px-3 text-sm font-medium disabled:opacity-60"
          onClick={onAddToShopping}
        >
          Cumpără
        </button>
      </div>
    </article>
  )
}
