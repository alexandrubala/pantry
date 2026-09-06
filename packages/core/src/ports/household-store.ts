export type HouseholdRole = 'owner' | 'member'

export type HouseholdSummary = {
  id: string
  name: string
  role: HouseholdRole
  isActive: boolean
}

export type ActiveHousehold = {
  id: string
  name: string
  role: HouseholdRole
}

export type LocationRecord = {
  id: string
  name: string
  sortOrder: number
}

export type CreateHouseholdResult = {
  household: ActiveHousehold
  locations: LocationRecord[]
}

export type HouseholdMembership = {
  householdId: string
  name: string
  role: HouseholdRole
}

export type HouseholdStore = {
  createHouseholdWithOwnerAndLocations(input: {
    userId: string
    name: string
    ownerDisplayName: string
  }): Promise<CreateHouseholdResult>
  listForUser(userId: string): Promise<HouseholdSummary[]>
  getMembership(userId: string, householdId: string): Promise<HouseholdMembership | null>
  getActiveHousehold(userId: string): Promise<ActiveHousehold | null>
  setActiveHousehold(userId: string, householdId: string): Promise<void>
  listActiveLocations(householdId: string): Promise<LocationRecord[]>
  createLocation(input: { householdId: string; name: string }): Promise<LocationRecord>
}
