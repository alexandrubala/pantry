import type { Unit } from '../product/units.js'

export type ShoppingItem = {
  id: string
  productId: string | null
  name: string
  quantity: number | null
  unit: Unit | null
  checked: boolean
}

export type ShoppingList = {
  id: string
  items: ShoppingItem[]
}

export type ShoppingStore = {
  getOrCreateActiveList(input: { householdId: string }): Promise<ShoppingList>
  getActiveList(input: { householdId: string }): Promise<ShoppingList | null>
  addProductItem(input: {
    householdId: string
    userId: string
    productId: string
    quantity: unknown
    unit: unknown
  }): Promise<ShoppingItem>
  addManualItem(input: {
    householdId: string
    userId: string
    name: string
    quantity?: unknown
    unit?: unknown
  }): Promise<ShoppingItem>
  toggleItem(input: {
    householdId: string
    itemId: string
    checked: boolean
  }): Promise<ShoppingItem>
  removeItem(input: { householdId: string; itemId: string }): Promise<void>
  clearCompleted(input: { householdId: string }): Promise<ShoppingList>
}
