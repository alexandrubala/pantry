export {
  DOMAIN_ERROR_CODES,
  DomainError,
  httpStatusForDomainError,
  isDomainError,
  type DomainErrorCode,
} from './errors.js'
export {
  DEFAULT_HOUSEHOLD_NAME,
  MAX_HOUSEHOLD_NAME_LENGTH,
  validateHouseholdName,
} from './household/names.js'
export {
  DEFAULT_LOCATIONS,
  DEFAULT_LOCATION_SPECS,
  nextLocationSortOrder,
  type DefaultLocation,
} from './household/defaults.js'
export {
  assertMemberAccess,
  planHouseholdCreation,
  selectFallbackHouseholdId,
  type PlannedHouseholdCreation,
  type PlannedLocation,
} from './household/plan.js'
export {
  MAX_LOCATION_NAME_LENGTH,
  normalizeLocationName,
  validateLocationName,
} from './location/names.js'
export type {
  ActiveHousehold,
  CreateHouseholdResult,
  HouseholdMembership,
  HouseholdRole,
  HouseholdStore,
  HouseholdSummary,
  LocationRecord,
} from './ports/household-store.js'
