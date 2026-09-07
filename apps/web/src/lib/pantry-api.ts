import type {
  ActiveHousehold,
  ConstraintVerification,
  ExternalCatalogId,
  HouseholdSummary,
  InventoryHistoryEntry,
  InventoryItem,
  LocationRecord,
  ProductNutrition,
  ProductRecord,
  RecipeMode,
  RecipeSummary,
  ShoppingItem,
  ShoppingList,
  Unit,
} from '@pantry/core'
import { apiGet, apiSend, apiSendForm } from './api'

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

export type ProductsResponse = {
  products: ProductRecord[]
}

export type CreateProductResponse = {
  product: ProductRecord
}

export type InventoryResponse = {
  items: InventoryItem[]
}

export type InventoryMutationResponse = {
  item: InventoryItem | null
}

export type InventoryHistoryResponse = {
  history: InventoryHistoryEntry[]
}

export type InventorySummaryResponse = {
  products: number
  lots: number
  lowStock: number
  expiringSoon: number
  expired: number
}

export type InventorySettingsResponse = {
  settings: {
    productId: string
    minimumQuantity: number
    unit: Unit
  }
}

export type ExpiringLotsResponse = {
  lots: Array<{
    id: string
    productId: string
    productName: string
    brand: string | null
    locationId: string
    locationName: string
    quantity: number
    unit: Unit
    expiresOn: string
    daysRemaining: number
    status: 'expired' | 'today' | 'tomorrow' | 'soon'
  }>
}

export type ShoppingListResponse = {
  list: ShoppingList
}

export type ShoppingItemResponse = {
  item: ShoppingItem
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

export function getProducts(search?: string) {
  const query = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''
  return apiGet<ProductsResponse>(`/api/v1/products${query}`)
}

export function createProduct(input: { name: string; brand?: string; unit: string; barcode?: string }) {
  return apiSend<CreateProductResponse>('/api/v1/products', 'POST', input)
}

export function updateProduct(
  productId: string,
  input: { name?: string; brand?: string | null; unit?: string },
) {
  return apiSend<CreateProductResponse>(`/api/v1/products/${encodeURIComponent(productId)}`, 'PATCH', input)
}

export function overrideHouseholdProductUnit(
  productId: string,
  input: {
    unit: string
    lots: Array<{ lotId: string; quantity: number }>
  },
) {
  return apiSend<{ item: InventoryItem | null; product: InventoryItem['product'] | null }>(
    `/api/v1/products/${encodeURIComponent(productId)}/local-override`,
    'POST',
    input,
  )
}

export function uploadProductImage(productId: string, image: Blob, fileName = 'product.webp') {
  const form = new FormData()
  form.append('image', image, fileName)
  return apiSendForm<CreateProductResponse>(
    `/api/v1/products/${encodeURIComponent(productId)}/image`,
    form,
    'PUT',
  )
}

export function deleteProductImage(productId: string) {
  return apiSend<CreateProductResponse>(`/api/v1/products/${encodeURIComponent(productId)}/image`, 'DELETE')
}

export type BarcodeLookupExisting = {
  status: 'existing'
  product: ProductRecord
}

export type ExternalBarcodeProduct = {
  barcode: string
  catalog: ExternalCatalogId
  productType: string | null
  name: string | null
  brand: string | null
  imageUrl: string | null
  quantityText: string | null
  packageQuantity: number | null
  packageUnit: Unit | null
  packageQuantityConfident: boolean
  unit: Unit
  nutrition: ProductNutrition | null
}

export type BarcodeLookupExternal = {
  status: 'external'
  product: ExternalBarcodeProduct
}

export type BarcodeLookupNotFound = {
  status: 'not_found'
  barcode: string
}

export type BarcodeLookupResponse = BarcodeLookupExisting | BarcodeLookupExternal | BarcodeLookupNotFound

export type ImportBarcodeResponse = {
  product: ProductRecord
}

export function lookupBarcode(barcode: string) {
  return apiGet<BarcodeLookupResponse>(`/api/v1/barcodes/${encodeURIComponent(barcode)}`)
}

export function importBarcode(barcode: string) {
  return apiSend<ImportBarcodeResponse>(`/api/v1/barcodes/${encodeURIComponent(barcode)}/import`, 'POST', {})
}

export function getInventory(input?: { search?: string; locationId?: string }) {
  const params = new URLSearchParams()
  if (input?.search?.trim()) {
    params.set('search', input.search.trim())
  }
  if (input?.locationId) {
    params.set('locationId', input.locationId)
  }
  const query = params.toString()
  return apiGet<InventoryResponse>(`/api/v1/inventory${query ? `?${query}` : ''}`)
}

export function getInventorySummary(today: string) {
  return apiGet<InventorySummaryResponse>(`/api/v1/inventory/summary?today=${encodeURIComponent(today)}`)
}

export function getExpiringLots(input?: { today?: string; days?: number }) {
  const params = new URLSearchParams()
  if (input?.today) {
    params.set('today', input.today)
  }
  if (input?.days != null) {
    params.set('days', String(input.days))
  }
  const query = params.toString()
  return apiGet<ExpiringLotsResponse>(`/api/v1/inventory/expiring${query ? `?${query}` : ''}`)
}

export function setMinimumQuantity(productId: string, minimumQuantity: number) {
  return apiSend<InventorySettingsResponse>(
    `/api/v1/inventory/settings/${encodeURIComponent(productId)}`,
    'PUT',
    { minimumQuantity },
  )
}

export function addStock(input: {
  productId: string
  locationId: string
  quantity: number
  expiresOn: string | null
}) {
  return apiSend<InventoryMutationResponse>('/api/v1/inventory/stock', 'POST', input)
}

export function consumeStock(input: { productId: string; quantity: number }) {
  return apiSend<InventoryMutationResponse>('/api/v1/inventory/consume', 'POST', input)
}

export function adjustLot(input: { lotId: string; expectedQuantity: number; quantity: number }) {
  return apiSend<InventoryMutationResponse>('/api/v1/inventory/adjust', 'POST', input)
}

export function moveLot(input: { lotId: string; locationId: string }) {
  return apiSend<InventoryMutationResponse>('/api/v1/inventory/move', 'POST', input)
}

export function updateLot(input: {
  lotId: string
  expected: {
    quantity: number
    locationId: string
    expiresOn: string | null
  }
  quantity: number
  locationId: string
  expiresOn: string | null
}) {
  return apiSend<InventoryMutationResponse>(`/api/v1/inventory/lots/${encodeURIComponent(input.lotId)}`, 'PATCH', {
    expected: input.expected,
    quantity: input.quantity,
    locationId: input.locationId,
    expiresOn: input.expiresOn,
  })
}

export function getInventoryHistory(productId?: string) {
  const query = productId ? `?productId=${encodeURIComponent(productId)}` : ''
  return apiGet<InventoryHistoryResponse>(`/api/v1/inventory/history${query}`)
}

export function getShoppingList() {
  return apiGet<ShoppingListResponse>('/api/v1/shopping')
}

export function addShoppingProductItem(input: { productId: string; quantity: number; unit: Unit }) {
  return apiSend<ShoppingItemResponse>('/api/v1/shopping/items/product', 'POST', input)
}

export function addShoppingManualItem(input: {
  name: string
  quantity?: number | null
  unit?: Unit | null
}) {
  return apiSend<ShoppingItemResponse>('/api/v1/shopping/items', 'POST', input)
}

export function toggleShoppingItem(itemId: string, checked: boolean) {
  return apiSend<ShoppingItemResponse>(`/api/v1/shopping/items/${encodeURIComponent(itemId)}`, 'PATCH', {
    checked,
  })
}

export function removeShoppingItem(itemId: string) {
  return apiSend<void>(`/api/v1/shopping/items/${encodeURIComponent(itemId)}`, 'DELETE')
}

export function clearCompletedShoppingItems() {
  return apiSend<ShoppingListResponse>('/api/v1/shopping/clear-completed', 'POST', {})
}

export type RecipeNutritionView = {
  complete: boolean
  calculableIngredients: number
  totalIngredients: number
  perServing: {
    kcal: number | null
    protein: number | null
    carbs: number | null
    fat: number | null
  }
}

export type RecipeView = {
  id: string
  title: string
  description: string | null
  servings: number
  timeMinutes: number | null
  ingredients: Array<{
    productId: string | null
    name: string
    quantity: number
    unit: Unit
  }>
  instructions: string[]
  notes: string | null
  nutrition: RecipeNutritionView
  constraintVerification: ConstraintVerification
  createdAt: string
}

export type GenerateRecipeInput = {
  servings: number
  mode: RecipeMode
  maxCaloriesPerServing?: number
  minProteinPerServing?: number
  maxTimeMinutes?: number
  preference?: string
}

export type GenerateRecipeResponse = {
  recipe: RecipeView
}

export type RecipesResponse = {
  recipes: RecipeSummary[]
}

export type RecipeResponse = {
  recipe: RecipeView
}

export type CookRecipeResponse = {
  cooked: true
}

export function generateRecipe(input: GenerateRecipeInput) {
  return apiSend<GenerateRecipeResponse>('/api/v1/ai/recipes/generate', 'POST', input)
}

export function getRecipes() {
  return apiGet<RecipesResponse>('/api/v1/recipes')
}

export function getRecipe(id: string) {
  return apiGet<RecipeResponse>(`/api/v1/recipes/${encodeURIComponent(id)}`)
}

export function cookRecipe(id: string) {
  return apiSend<CookRecipeResponse>(`/api/v1/recipes/${encodeURIComponent(id)}/cook`, 'POST', {})
}

export type HouseholdMemberView = {
  userId: string
  name: string
  email: string
  role: 'owner' | 'member'
  isCurrentUser: boolean
}

export type HouseholdMembersResponse = {
  members: HouseholdMemberView[]
}

export type HouseholdInviteView = {
  id: string
  status: 'pending' | 'accepted' | 'expired' | 'revoked'
  expiresAt: string
  createdAt: string
}

export type HouseholdInvitesResponse = {
  invites: HouseholdInviteView[]
}

export type CreateInviteResponse = {
  invite: {
    id: string
    token: string
    expiresAt: string
  }
}

export type InvitePreviewResponse = {
  valid: true
  householdName: string
  expiresAt: string
}

export type AcceptInviteResponse = {
  household: ActiveHousehold
}

export function getHouseholdMembers() {
  return apiGet<HouseholdMembersResponse>('/api/v1/household/members')
}

export function getHouseholdInvites() {
  return apiGet<HouseholdInvitesResponse>('/api/v1/household/invites')
}

export function createHouseholdInvite() {
  return apiSend<CreateInviteResponse>('/api/v1/household/invites', 'POST', {})
}

export function revokeHouseholdInvite(inviteId: string) {
  return apiSend<void>(`/api/v1/household/invites/${encodeURIComponent(inviteId)}`, 'DELETE')
}

export function removeHouseholdMember(userId: string) {
  return apiSend<void>(`/api/v1/household/members/${encodeURIComponent(userId)}`, 'DELETE')
}

export function leaveHousehold() {
  return apiSend<void>('/api/v1/household/leave', 'POST', {})
}

export function renameHousehold(name: string) {
  return apiSend<ActiveHouseholdResponse>('/api/v1/household', 'PATCH', { name })
}

export function renameLocation(locationId: string, name: string) {
  return apiSend<CreateLocationResponse>(`/api/v1/locations/${encodeURIComponent(locationId)}`, 'PATCH', { name })
}

export function deactivateLocation(locationId: string) {
  return apiSend<void>(`/api/v1/locations/${encodeURIComponent(locationId)}`, 'DELETE')
}

export type ReceiptDraftLineView = {
  rawName: string
  name: string
  quantity: number | null
  unit: Unit | null
  lineTotal: number | null
  weightValue: number | null
  weightUnit: 'g' | 'kg' | 'ml' | 'l' | null
  confidence: number | null
  suggestedProduct: {
    id: string
    name: string
    brand: string | null
    unit: Unit
    packageQuantity: number | null
    packageUnit: Unit | null
  } | null
  suggestedQuantity: number | null
  suggestedUnit: Unit | null
}

export type ReceiptExtractResponse = {
  receipt: {
    merchant: string | null
    date: string | null
    currency: string | null
    total: number | null
    items: ReceiptDraftLineView[]
  }
}

export function extractReceipt(image: Blob, fileName = 'receipt.jpg') {
  const form = new FormData()
  form.append('image', image, fileName)
  return apiSendForm<ReceiptExtractResponse>('/api/v1/receipts/extract', form)
}

export function getInvitePreview(token: string) {
  return apiGet<InvitePreviewResponse>(`/api/v1/invites/${encodeURIComponent(token)}`)
}

export function acceptInvite(token: string) {
  return apiSend<AcceptInviteResponse>(`/api/v1/invites/${encodeURIComponent(token)}/accept`, 'POST', {})
}
