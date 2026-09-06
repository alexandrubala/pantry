import { normalizeLocationName } from '../location/names.js'

export type DefaultLocation = {
  name: string
  normalizedName: string
  sortOrder: number
}

export const DEFAULT_LOCATION_SPECS = [
  { name: 'Frigider', sortOrder: 10 },
  { name: 'Congelator', sortOrder: 20 },
  { name: 'Cămară', sortOrder: 30 },
  { name: 'Baie', sortOrder: 40 },
  { name: 'Garaj', sortOrder: 50 },
  { name: 'Curățenie', sortOrder: 60 },
  { name: 'Altele', sortOrder: 70 },
] as const

export const DEFAULT_LOCATIONS: readonly DefaultLocation[] = DEFAULT_LOCATION_SPECS.map(
  (location) => ({
    name: location.name,
    normalizedName: normalizeLocationName(location.name),
    sortOrder: location.sortOrder,
  }),
)

export function nextLocationSortOrder(existingMax: number | null): number {
  if (existingMax === null) {
    return 10
  }

  return existingMax + 10
}
