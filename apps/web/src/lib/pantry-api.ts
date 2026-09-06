import type { ActiveHousehold, HouseholdSummary, LocationRecord } from '@pantry/core'
import { apiGet, apiSend } from './api'

export type HouseholdsResponse = {
  households: HouseholdSummary[]
}

export type ActiveHouseholdResponse = {
  household: ActiveHousehold | null
}

export type LocationsResponse = {
  locations: LocationRecord[]
}

export type CreateHouseholdResponse = {
  household: ActiveHousehold
}

export type CreateLocationResponse = {
  location: LocationRecord
}

export function getHouseholds() {
  return apiGet<HouseholdsResponse>('/api/v1/households')
}

export function getActiveHousehold() {
  return apiGet<ActiveHouseholdResponse>('/api/v1/household')
}

export function createHousehold(name: string) {
  return apiSend<CreateHouseholdResponse>('/api/v1/households', 'POST', { name })
}

export function setActiveHousehold(householdId: string) {
  return apiSend<ActiveHouseholdResponse>('/api/v1/household/active', 'PUT', { householdId })
}

export function getLocations() {
  return apiGet<LocationsResponse>('/api/v1/locations')
}

export function createLocation(name: string) {
  return apiSend<CreateLocationResponse>('/api/v1/locations', 'POST', { name })
}
