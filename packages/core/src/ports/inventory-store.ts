import type { ExternalCatalogId } from './external-product-catalog.js'
import type { ProductNutrition } from '../product/nutrition.js'
import type { Unit } from '../product/units.js'
import type { ConsumableLot, ConsumptionPlanResult } from '../inventory/consumption.js'

export type InventoryLotRecord = {
  id: string
  locationId: string
  locationName: string
  quantity: number
  expiresOn: string | null
}

export type InventoryProduct = {
  id: string
  name: string
  brand: string | null
  unit: Unit
  barcode: string | null
  imageUrl: string | null
  source: 'manual' | 'open_food_facts'
  householdOwned: boolean
  externalCatalog: ExternalCatalogId | null
  packageQuantity: number | null
  packageUnit: Unit | null
  nutrition: ProductNutrition | null
}

export type InventoryItem = {
  product: InventoryProduct
  totalQuantity: number
  nearestExpiry: string | null
  lots: InventoryLotRecord[]
  minimumQuantity: number
  lowStock: boolean
}

export type InventoryHistoryAction = 'add' | 'consume' | 'adjust' | 'move' | 'edit'

export type InventoryHistoryEditMetadata = {
  oldLocationId: string
  newLocationId: string
  oldExpiresOn: string | null
  newExpiresOn: string | null
}

export type InventoryHistoryEntry = {
  id: string
  productId: string
  productName: string
  locationId: string
  locationName: string
  userId: string
  action: InventoryHistoryAction
  deltaQuantity: number
  unit: Unit
  expiresOn: string | null
  metadata: InventoryHistoryEditMetadata | null
  createdAt: string
}

export type InventorySummary = {
  products: number
  lots: number
  lowStock: number
  expiringSoon: number
  expired: number
}

export type ExpiringLot = {
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
}

export type InventorySettings = {
  productId: string
  minimumQuantity: number
  unit: Unit
}

export type InventoryStore = {
  getInventory(input: {
    householdId: string
    search?: string | null
    locationId?: string | null
  }): Promise<InventoryItem[]>
  getSummary(input: { householdId: string; today: string }): Promise<InventorySummary>
  listExpiring(input: {
    householdId: string
    today: string
    days: number
  }): Promise<ExpiringLot[]>
  setMinimumQuantity(input: {
    householdId: string
    productId: string
    minimumQuantity: unknown
  }): Promise<InventorySettings>
  addStock(input: {
    householdId: string
    userId: string
    productId: string
    locationId: string
    quantity: unknown
    expiresOn?: unknown
  }): Promise<InventoryItem>
  adjustLot(input: {
    householdId: string
    userId: string
    lotId: string
    expectedQuantity: unknown
    quantity: unknown
  }): Promise<InventoryItem | null>
  updateLot(input: {
    householdId: string
    userId: string
    lotId: string
    expected: {
      quantity: unknown
      locationId: unknown
      expiresOn: unknown
    }
    quantity: unknown
    locationId: unknown
    expiresOn: unknown
  }): Promise<InventoryItem | null>
  overrideHouseholdUnit(input: {
    householdId: string
    userId: string
    productId: string
    unit: unknown
    lots: unknown
  }): Promise<InventoryItem | null>
  moveLot(input: {
    householdId: string
    userId: string
    lotId: string
    locationId: string
  }): Promise<InventoryItem>
  readLotsForConsumption(input: {
    householdId: string
    productId: string
  }): Promise<ConsumableLot[]>
  consume(input: {
    householdId: string
    userId: string
    productId: string
    quantity: unknown
  }): Promise<{ item: InventoryItem | null; plan: Extract<ConsumptionPlanResult, { ok: true }> }>
  listHistory(input: {
    householdId: string
    productId?: string | null
    limit?: number
  }): Promise<InventoryHistoryEntry[]>
}
