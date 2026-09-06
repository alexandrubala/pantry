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
export {
  MAX_PRODUCT_BRAND_LENGTH,
  MAX_PRODUCT_NAME_LENGTH,
  normalizeProductName,
  validateProductBrand,
  validateProductName,
} from './product/names.js'
export {
  planExternalProduct,
  planManualProduct,
  resolveImportedProductName,
  type PlannedExternalProduct,
  type PlannedManualProduct,
} from './product/plan.js'
export { UNITS, isUnit, validateProductUnit, type Unit } from './product/units.js'
export { validateBarcode, MIN_BARCODE_LENGTH, MAX_BARCODE_LENGTH } from './barcode/validate.js'
export {
  defaultUnitFromPackage,
  inferPackageQuantity,
  type PackageQuantityInference,
} from './product/package-quantity.js'
export { isEmptyNutrition, type ProductNutrition } from './product/nutrition.js'
export {
  EXTERNAL_CATALOGS,
  type ExternalCatalogId,
  type ExternalLookupResult,
  type ExternalProduct,
  type ExternalProductCatalog,
} from './ports/external-product-catalog.js'
export {
  buildConsumptionPlan,
  totalAvailableQuantity,
  type ConsumableLot,
  type ConsumptionAllocation,
  type ConsumptionPlanResult,
} from './inventory/consumption.js'
export { expiresKey, parseExpiresOn } from './inventory/expiry.js'
export { validateQuantity } from './inventory/quantity.js'
export type {
  ActiveHousehold,
  CreateHouseholdResult,
  HouseholdMembership,
  HouseholdRole,
  HouseholdStore,
  HouseholdSummary,
  LocationRecord,
} from './ports/household-store.js'
export type { ProductRecord, ProductStore } from './ports/product-store.js'
export type {
  InventoryHistoryEntry,
  InventoryItem,
  InventoryLotRecord,
  InventoryProduct,
  InventoryStore,
} from './ports/inventory-store.js'
