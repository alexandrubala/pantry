import type { ProductNutrition } from '@pantry/core'
import type { Unit } from '@pantry/shared'

const UNIT_LABELS: Record<Unit, { one: string; other: string }> = {
  g: { one: 'g', other: 'g' },
  ml: { one: 'ml', other: 'ml' },
  each: { one: 'buc', other: 'buc' },
  package: { one: 'pachet', other: 'pachete' },
}

const numberFormatter = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 3 })
const nutrientFormatter = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 2 })

export function unitLabel(unit: Unit, quantity = 2): string {
  const labels = UNIT_LABELS[unit]
  return quantity === 1 ? labels.one : labels.other
}

export function formatQuantity(quantity: number, unit: Unit): string {
  return `${numberFormatter.format(quantity)} ${unitLabel(unit, quantity)}`
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

export function formatExpiryHeadline(isoDate: string): string {
  return `Expiră pe ${formatDayMonthRo(isoDate)}`
}

export function formatLotExpiry(isoDate: string | null): string {
  return isoDate ? formatDayMonthRo(isoDate) : 'fără expirare'
}

export function localIsoDate(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isExpirySoon(isoDate: string, today = localIsoDate()): boolean {
  const limit = new Date(`${today}T00:00:00Z`)
  limit.setUTCDate(limit.getUTCDate() + 3)
  const limitIso = limit.toISOString().slice(0, 10)
  return isoDate <= limitIso
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
