import type { InventoryItem } from '@pantry/core'
import { AlertTriangle, MoreHorizontal, Plus } from 'lucide-react'
import { ProductImage } from '../scan/ProductImage'
import {
  formatExpiryBadge,
  formatKcal100g,
  formatMacroLine,
  formatQuantity,
} from '../../lib/inventory-format'

export function InventoryProductCard({
  item,
  today,
  busy = false,
  shoppingBusy = false,
  onQuickAdd,
  onAddStock,
  onConsume,
  onQuickConsume,
  onAddToShopping,
  onMinimum,
  onEdit,
  onLots,
  onHistory,
}: {
  item: InventoryItem
  today: string
  busy?: boolean
  shoppingBusy?: boolean
  onQuickAdd: () => void
  onAddStock: () => void
  onConsume: () => void
  onQuickConsume?: () => void
  onAddToShopping: () => void
  onMinimum: () => void
  onEdit?: () => void
  onLots: () => void
  onHistory: () => void
}) {
  const nearestBadge = item.nearestExpiry ? formatExpiryBadge(item.nearestExpiry, today) : null
  const nutrition = item.product.nutrition
  const kcal = nutrition?.energyKcal100g
  const macros = nutrition ? formatMacroLine(nutrition) : null
  const locationSummary = summarizeLocations(item)
  const countUnit = item.product.unit === 'each' || item.product.unit === 'package'

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
        <p className="mt-2 text-sm text-muted">
          {formatKcal100g(kcal)}
          {macros ? ` · ${macros}` : ''}
        </p>
      ) : null}

      {nearestBadge && nearestBadge.status !== 'later' ? (
        <p
          className={`mt-2 flex items-center gap-1.5 text-sm ${
            nearestBadge.tone === 'danger'
              ? 'font-medium text-destructive'
              : nearestBadge.tone === 'warning'
                ? 'font-medium text-warning'
                : 'text-muted'
          }`}
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          {nearestBadge.label}
        </p>
      ) : nearestBadge ? (
        <p className="mt-2 text-sm text-muted">Expiră pe {nearestBadge.label}</p>
      ) : null}

      {item.lowStock ? (
        <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-warning">
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          Stoc scăzut
        </p>
      ) : null}

      {item.lowStock ? (
        <p className="mt-1 text-sm text-muted">
          {formatQuantity(item.totalQuantity, item.product.unit)} disponibili · minim{' '}
          {formatQuantity(item.minimumQuantity, item.product.unit)}
        </p>
      ) : null}

      {locationSummary ? <p className="mt-2 text-sm text-muted">{locationSummary}</p> : null}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={busy}
          className="flex h-touch min-h-touch min-w-touch items-center justify-center rounded-lg border border-border px-3 text-sm font-medium disabled:opacity-60"
          onClick={onQuickAdd}
          aria-label="Adaugă stoc"
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={busy || item.totalQuantity <= 0}
          className="flex h-touch min-h-touch flex-1 items-center justify-center rounded-lg bg-accent px-3 text-sm font-medium text-accent-foreground disabled:opacity-60"
          onClick={countUnit && onQuickConsume ? onQuickConsume : onConsume}
        >
          {countUnit ? '−1' : 'Consumă'}
        </button>
        <details className="relative">
          <summary
            className="flex h-touch min-h-touch min-w-touch list-none items-center justify-center rounded-lg border border-border px-3 text-sm font-medium [&::-webkit-details-marker]:hidden"
            aria-label="Mai multe acțiuni"
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </summary>
          <div
            role="menu"
            className="absolute right-0 z-10 mt-1 w-56 rounded-xl border border-border bg-surface-elevated p-1 shadow-elevated"
          >
            {item.lowStock ? (
              <OverflowItem disabled={shoppingBusy} onClick={onAddToShopping}>
                Adaugă la cumpărături
              </OverflowItem>
            ) : (
              <OverflowItem disabled={shoppingBusy} onClick={onAddToShopping}>
                Adaugă la cumpărături
              </OverflowItem>
            )}
            <OverflowItem onClick={onMinimum}>Stoc minim</OverflowItem>
            {onEdit ? <OverflowItem onClick={onEdit}>Editează produsul</OverflowItem> : null}
            <OverflowItem onClick={onLots}>Loturi</OverflowItem>
            <OverflowItem onClick={onHistory}>Istoric</OverflowItem>
            <OverflowItem onClick={onAddStock}>Adaugă stoc</OverflowItem>
            {countUnit ? <OverflowItem onClick={onConsume}>Consumă altă cantitate</OverflowItem> : null}
          </div>
        </details>
      </div>
    </article>
  )
}

function OverflowItem({
  children,
  onClick,
  disabled = false,
}: {
  children: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className="flex h-touch min-h-touch w-full items-center rounded-lg px-3 text-left text-sm disabled:opacity-60"
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function summarizeLocations(item: InventoryItem): string | null {
  if (item.lots.length === 0) {
    return null
  }

  const names = [...new Set(item.lots.map((lot) => lot.locationName))]
  if (names.length === 1) {
    return item.lots.length === 1
      ? names[0] ?? null
      : `${names[0]} · ${item.lots.length} loturi`
  }

  return names.slice(0, 3).join(' · ')
}
