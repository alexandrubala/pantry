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
}

export type InventoryItem = {
  product: InventoryProduct
  totalQuantity: number
  nearestExpiry: string | null
  lots: InventoryLotRecord[]
}

export type InventoryHistoryEntry = {
  id: string
  productId: string
  locationId: string
  userId: string
  action: 'add' | 'consume' | 'adjust'
  deltaQuantity: number
  unit: Unit
  expiresOn: string | null
  createdAt: string
}

export type InventoryStore = {
  getInventory(input: {
    householdId: string
    search?: string | null
    locationId?: string | null
  }): Promise<InventoryItem[]>
  addStock(input: {
    householdId: string
    userId: string
    productId: string
    locationId: string
    quantity: unknown
    expiresOn?: unknown
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
