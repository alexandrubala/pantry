import type {
  ActiveHousehold,
  ExternalCatalogId,
  HouseholdSummary,
  InventoryHistoryEntry,
  InventoryItem,
  LocationRecord,
  ProductNutrition,
  ProductRecord,
  ShoppingItem,
  ShoppingList,
  Unit,
} from '@pantry/core'
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
