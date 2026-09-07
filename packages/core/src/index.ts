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
  assertHouseholdMember,
  assertHouseholdOwner,
  assertMemberAccess,
  planHouseholdCreation,
  selectFallbackHouseholdId,
  type PlannedHouseholdCreation,
  type PlannedLocation,
} from './household/plan.js'
export {
  INVITE_ROLE,
  INVITE_TOKEN_BYTES,
  INVITE_TTL_MS,
  assertInviteAcceptable,
  deriveInviteStatus,
  generateInviteToken,
  hashInviteToken,
  inviteExpiresAt,
  isInviteTokenFormat,
  requireInviteToken,
  type InviteStatus,
  type InviteTimestamps,
} from './household/invite.js'
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
  PRODUCT_ALLOWED_IMAGE_TYPES,
  PRODUCT_MAX_IMAGE_BYTES,
  inspectProductImage,
  type InspectedProductImage,
  type ProductImageContentType,
} from './product/image.js'
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
export {
  CONSUME_PERCENTS,
  consumePercentQuantity,
  isDiscreteUnit,
  roundHalfToEven,
  type ConsumePercent,
} from './inventory/consume-percent.js'
export {
  EXPIRING_SOON_DAYS,
  addDaysIso,
  calendarDaysBetween,
  classifyExpiry,
  expiresKey,
  isExpiredLot,
  isExpiringSoonLot,
  parseExpiresOn,
  parseRequiredIsoDate,
  utcIsoDate,
  type ExpiryStatus,
} from './inventory/expiry.js'
export { isLowStock } from './inventory/low-stock.js'
export {
  validateMinimumQuantity,
  validateNonNegativeQuantity,
  validateQuantity,
} from './inventory/quantity.js'
export { lotQuickAddStep, type LotQuickAddStep } from './inventory/lot-quick-add.js'
export {
  MAX_SHOPPING_ITEM_NAME_LENGTH,
  normalizeShoppingItemName,
  validateShoppingItemName,
} from './shopping/names.js'
export {
  validateOptionalShoppingQuantity,
  validateOptionalShoppingUnit,
} from './shopping/quantity.js'
export {
  mergeShoppingQuantities,
  shoppingUnitsCompatible,
  type ShoppingQuantity,
} from './shopping/merge.js'
export { suggestShoppingQuantity, type ShoppingQuantitySuggestion } from './shopping/suggest.js'
export type {
  ActiveHousehold,
  CreateHouseholdResult,
  HouseholdMembership,
  HouseholdRole,
  HouseholdStore,
  HouseholdSummary,
  LocationRecord,
} from './ports/household-store.js'
export type {
  CreatedHouseholdInvite,
  HouseholdInviteRecord,
  HouseholdInviteSummary,
  HouseholdMemberRecord,
  HouseholdSharingStore,
} from './ports/household-sharing-store.js'
export type {
  HouseholdProductImageRecord,
  ProductRecord,
  ProductStore,
} from './ports/product-store.js'
export type {
  ExpiringLot,
  InventoryHistoryAction,
  InventoryHistoryEditMetadata,
  InventoryHistoryEntry,
  InventoryItem,
  InventoryLotRecord,
  InventoryProduct,
  InventorySettings,
  InventoryStore,
  InventorySummary,
} from './ports/inventory-store.js'
export type { ShoppingItem, ShoppingList, ShoppingStore } from './ports/shopping-store.js'
export type {
  AiProvider,
  AiRecipeGenerationInput,
  ReceiptVisionInput,
  ReceiptVisionProvider,
} from './ports/ai-provider.js'
export type { ReceiptExtractionReservation, ReceiptStore } from './ports/receipt-store.js'
export type {
  AiGenerationReservation,
  RecipeStore,
} from './ports/recipe-store.js'
export {
  AI_GENERATION_LIMIT_PER_HOUR,
  DEFAULT_RECIPE_SERVINGS,
  MAX_CALORIES_PER_SERVING,
  MAX_PROTEIN_PER_SERVING,
  MAX_RECIPE_PREFERENCE_LENGTH,
  MAX_RECIPE_SERVINGS,
  MAX_RECIPE_TIME_MINUTES,
  MIN_RECIPE_SERVINGS,
  RECIPE_MODES,
  type AiRecipeCandidate,
  type AiRecipeIngredient,
  type ConstraintVerification,
  type GeneratedRecipe,
  type InventoryProductContext,
  type RecipeGenerationRequest,
  type RecipeIngredient,
  type RecipeMode,
  type RecipeNutrition,
  type RecipeNutrientTotals,
  type RecipeSummary,
  type SavedRecipe,
} from './recipe/types.js'
export { AI_RECIPE_JSON_SCHEMA } from './recipe/schema.js'
export { parseRecipeGenerationRequest } from './recipe/request.js'
export { buildInventoryContext } from './recipe/context.js'
export {
  mergeCandidateIngredients,
  parseAiRecipeCandidate,
  validateCandidateAgainstInventory,
} from './recipe/candidate.js'
export { calculateRecipeNutrition } from './recipe/nutrition.js'
export { verifyNutritionConstraints } from './recipe/constraints.js'
export { generateRecipeFromInventory } from './recipe/generate.js'
export {
  aiGenerationLimitPerHour,
  aiRateLimitRetryAfterSeconds,
  aiRateLimitWindowStart,
} from './recipe/rate-limit.js'
export { AI_RECEIPT_JSON_SCHEMA } from './receipt/schema.js'
export {
  RECEIPT_MAX_IMAGE_BYTES,
  RECEIPT_MAX_ITEMS,
  RECEIPT_WEIGHT_UNITS,
  type ReceiptDraft,
  type ReceiptDraftItem,
  type ReceiptDraftLine,
  type ReceiptProductMatch,
  type ReceiptWeightUnit,
} from './receipt/types.js'
export { parseReceiptDraft } from './receipt/parse.js'
export { matchReceiptProduct } from './receipt/match.js'
export { suggestReceiptImportQuantity, type ReceiptQuantitySuggestion } from './receipt/quantity.js'
export { annotateReceiptDraft } from './receipt/annotate.js'
export {
  RECEIPT_EXTRACTION_LIMIT_PER_HOUR,
  receiptExtractionLimitPerHour,
  receiptRateLimitRetryAfterSeconds,
  receiptRateLimitWindowStart,
} from './receipt/rate-limit.js'
