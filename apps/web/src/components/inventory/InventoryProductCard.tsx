import type { InventoryItem } from '@pantry/core'
import {
  formatExpiryHeadline,
  formatLotExpiry,
  formatQuantity,
  isExpirySoon,
} from '../../lib/inventory-format'

export function InventoryProductCard({
  item,
  onAddStock,
  onConsume,
}: {
  item: InventoryItem
  onAddStock: () => void
  onConsume: () => void
}) {
  const expirySoon = item.nearestExpiry ? isExpirySoon(item.nearestExpiry) : false

  return (
    <article className="rounded-2xl border border-border bg-surface-elevated p-4 shadow-surface">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">{item.product.name}</h2>
          {item.product.brand ? <p className="mt-0.5 text-sm text-muted">{item.product.brand}</p> : null}
        </div>
        <p className="shrink-0 text-base font-medium">{formatQuantity(item.totalQuantity, item.product.unit)}</p>
      </div>

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
      </div>
    </article>
  )
}
