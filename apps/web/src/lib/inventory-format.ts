import {
  classifyExpiry,
  lotQuickAddStep,
  type ExpiryStatus,
  type InventoryHistoryEntry,
  type InventoryItem,
  type InventoryLotRecord,
  type ProductNutrition,
} from '@pantry/core'
import type { Unit } from '@pantry/shared'

const UNIT_LABELS: Record<Unit, { one: string; other: string }> = {
  g: { one: 'g', other: 'g' },
  ml: { one: 'ml', other: 'ml' },
  each: { one: 'buc', other: 'buc' },
  package: { one: 'pachet', other: 'pachete' },
}

const numberFormatter = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 3 })
const nutrientFormatter = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 2 })
const timeFormatter = new Intl.DateTimeFormat('ro-RO', { hour: '2-digit', minute: '2-digit' })
const dayMonthFormatter = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'long' })

export function unitLabel(unit: Unit, quantity = 2): string {
  const labels = UNIT_LABELS[unit]
  return quantity === 1 ? labels.one : labels.other
}

export function formatQuantity(quantity: number, unit: Unit): string {
  return `${numberFormatter.format(quantity)} ${unitLabel(unit, quantity)}`
}

export function formatSignedQuantity(quantity: number, unit: Unit): string {
  const formatted = formatQuantity(Math.abs(quantity), unit)
  if (quantity > 0) {
    return `+${formatted}`
  }
  if (quantity < 0) {
    return `−${formatted}`
  }
  return formatted
}

export function formatDayMonthRo(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  if (!year || !month || !day) {
    return isoDate
  }

  return new Intl.DateTimeFormat('ro-RO', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

export function formatDayMonthYearRo(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  if (!year || !month || !day) {
    return isoDate
  }

  return new Intl.DateTimeFormat('ro-RO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

export function localIsoDate(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatExpiryHeadline(isoDate: string, today = localIsoDate()): string {
  return formatExpiryBadge(isoDate, today)?.label ?? `Expiră pe ${formatDayMonthRo(isoDate)}`
}

export function formatLotExpiry(isoDate: string | null): string {
  return isoDate ? formatDayMonthRo(isoDate) : 'fără expirare'
}

export function formatLotExpiryLine(isoDate: string | null, today = localIsoDate()): string {
  if (!isoDate) {
    return 'Fără expirare'
  }

  const badge = formatExpiryBadge(isoDate, today)
  if (badge?.status === 'expired') {
    return 'Expirat'
  }
  if (badge?.status === 'today') {
    return 'Expiră azi'
  }
  if (badge?.status === 'tomorrow') {
    return 'Expiră mâine'
  }

  return `Expiră: ${formatDayMonthYearRo(isoDate)}`
}

export function catalogStockSuggestionHint(quantity: number, unit: Unit): string {
  return `Sugestie catalog: ${formatQuantity(quantity, unit)}. Verifică cantitatea înainte de a salva.`
}

export function lotPlusButtonLabel(item: InventoryItem): string {
  const step = lotQuickAddStep(item.product)
  if (step?.asPackage) {
    return `+ 1 pachet (${formatQuantity(step.quantity, item.product.unit)})`
  }
  return 'Adaugă în acest lot'
}

export type ExpiryBadge = {
  status: Exclude<ExpiryStatus, 'none'>
  label: string
  tone: 'danger' | 'warning' | 'muted'
}

export function formatExpiryBadge(isoDate: string | null, today = localIsoDate()): ExpiryBadge | null {
  const status = classifyExpiry(isoDate, today)
  if (status === 'none' || !isoDate) {
    return null
  }

  if (status === 'expired') {
    return { status, label: 'Expirat', tone: 'danger' }
  }
  if (status === 'today') {
    return { status, label: 'Expiră azi', tone: 'warning' }
  }
  if (status === 'tomorrow') {
    return { status, label: 'Expiră mâine', tone: 'warning' }
  }
  if (status === 'soon') {
    const [year, month, day] = isoDate.split('-').map(Number)
    const [ty, tm, td] = today.split('-').map(Number)
    const remaining = Math.round(
      (Date.UTC(year, month - 1, day) - Date.UTC(ty, tm - 1, td)) / 86_400_000,
    )
    return { status, label: `Expiră în ${remaining} zile`, tone: 'warning' }
  }

  return { status, label: formatDayMonthRo(isoDate), tone: 'muted' }
}

export function isExpirySoon(isoDate: string, today = localIsoDate()): boolean {
  const status = classifyExpiry(isoDate, today)
  return status === 'today' || status === 'tomorrow' || status === 'soon'
}

export function isExpired(isoDate: string, today = localIsoDate()): boolean {
  return classifyExpiry(isoDate, today) === 'expired'
}

export function formatKcal100g(kcal: number): string {
  return `${nutrientFormatter.format(kcal)} kcal / 100 g`
}

export function formatMacroLine(nutrition: ProductNutrition): string | null {
  const parts: string[] = []
  if (nutrition.proteinG100g != null) {
    parts.push(`P ${nutrientFormatter.format(nutrition.proteinG100g)} g`)
  }
  if (nutrition.carbohydratesG100g != null) {
    parts.push(`C ${nutrientFormatter.format(nutrition.carbohydratesG100g)} g`)
  }
  if (nutrition.fatG100g != null) {
    parts.push(`G ${nutrientFormatter.format(nutrition.fatG100g)} g`)
  }

  return parts.length > 0 ? parts.join(' · ') : null
}

export function quickAddLot(item: InventoryItem, locationId: string): InventoryLotRecord | null {
  const match = item.lots.filter((lot) => lot.locationId === locationId && lot.expiresOn === null)
  return match.length === 1 ? (match[0] ?? null) : null
}

export function formatHistoryWhen(isoTimestamp: string, now = new Date()): string {
  const date = new Date(isoTimestamp)
  if (Number.isNaN(date.getTime())) {
    return isoTimestamp
  }

  const today = localIsoDate(now)
  const yesterdayDate = new Date(now)
  yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  const yesterday = localIsoDate(yesterdayDate)
  const stampDate = localIsoDate(date)
  const time = timeFormatter.format(date)

  if (stampDate === today) {
    return `astăzi, ${time}`
  }
  if (stampDate === yesterday) {
    return `ieri, ${time}`
  }

  return `${dayMonthFormatter.format(date)}, ${time}`
}

export function formatHistoryHeadline(entry: InventoryHistoryEntry): string {
  const qty = formatSignedQuantity(entry.deltaQuantity, entry.unit)
  if (entry.action === 'adjust') {
    return `Corectat · ${qty} ${entry.productName}`
  }
  if (entry.action === 'move') {
    return `Mutat · ${qty} ${entry.productName}`
  }
  if (entry.action === 'edit') {
    if (entry.deltaQuantity === 0) {
      return `Editat · ${entry.productName}`
    }
    return `Editat · ${qty} ${entry.productName}`
  }
  return `${qty} ${entry.productName}`
}

export type InventoryStatusFilter = 'all' | 'low' | 'soon' | 'expired'

export function itemMatchesStatusFilter(
  item: InventoryItem,
  filter: InventoryStatusFilter,
  today = localIsoDate(),
): boolean {
  if (filter === 'all') {
    return true
  }
  if (filter === 'low') {
    return item.lowStock
  }
  if (filter === 'expired') {
    return item.lots.some((lot) => lot.expiresOn != null && isExpired(lot.expiresOn, today))
  }
  return item.lots.some((lot) => lot.expiresOn != null && isExpirySoon(lot.expiresOn, today))
}

export type AttentionCard = {
  productId: string
  name: string
  reason: 'expired' | 'soon' | 'low'
  detail: string
}

export function attentionCards(items: InventoryItem[], today = localIsoDate(), limit = 5): AttentionCard[] {
  const expired: AttentionCard[] = []
  const soon: AttentionCard[] = []
  const low: AttentionCard[] = []

  for (const item of items) {
    const expiredLot = item.lots
      .filter((lot) => lot.expiresOn && isExpired(lot.expiresOn, today))
      .sort((left, right) => (left.expiresOn ?? '').localeCompare(right.expiresOn ?? ''))[0]
    if (expiredLot?.expiresOn) {
      expired.push({
        productId: item.product.id,
        name: item.product.name,
        reason: 'expired',
        detail: formatExpiryBadge(expiredLot.expiresOn, today)?.label ?? 'Expirat',
      })
      continue
    }

    const soonLot = item.lots
      .filter((lot) => lot.expiresOn && isExpirySoon(lot.expiresOn, today))
      .sort((left, right) => (left.expiresOn ?? '').localeCompare(right.expiresOn ?? ''))[0]
    if (soonLot?.expiresOn) {
      soon.push({
        productId: item.product.id,
        name: item.product.name,
        reason: 'soon',
        detail: formatExpiryBadge(soonLot.expiresOn, today)?.label ?? 'Expiră curând',
      })
      continue
    }

    if (item.lowStock) {
      low.push({
        productId: item.product.id,
        name: item.product.name,
        reason: 'low',
        detail: `${formatQuantity(item.totalQuantity, item.product.unit)} disponibili · minim ${formatQuantity(item.minimumQuantity, item.product.unit)}`,
      })
    }
  }

  return [...expired, ...soon, ...low].slice(0, limit)
}
