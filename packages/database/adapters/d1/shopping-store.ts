import {
  DomainError,
  mergeShoppingQuantities,
  validateOptionalShoppingQuantity,
  validateOptionalShoppingUnit,
  validateProductUnit,
  validateQuantity,
  validateShoppingItemName,
  type ShoppingItem,
  type ShoppingList,
  type ShoppingStore,
  type Unit,
} from '@pantry/core'
import type { D1DatabaseLike } from './d1-like.js'
import { createD1ProductStore } from './product-store.js'

type ItemRow = {
  id: string
  product_id: string | null
  name: string
  quantity: number | null
  unit: Unit | null
  is_checked: number
}

type ListIdRow = {
  id: string
}

function newId(): string {
  return crypto.randomUUID()
}

function nowIso(): string {
  return new Date().toISOString()
}

function isUniqueConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  return /UNIQUE constraint failed/i.test(error.message)
}

function toItem(row: ItemRow): ShoppingItem {
  return {
    id: row.id,
    productId: row.product_id,
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
    checked: row.is_checked === 1,
  }
}

const ITEM_SELECT = `SELECT id, product_id, name, quantity, unit, is_checked
         FROM shopping_items`

export function createD1ShoppingStore(db: D1DatabaseLike): ShoppingStore {
  const products = createD1ProductStore(db)

  async function getActiveListId(householdId: string): Promise<string | null> {
    const row = await db
      .prepare(
        `SELECT id
         FROM shopping_lists
         WHERE household_id = ?1 AND status = 'active'`,
      )
      .bind(householdId)
      .first<ListIdRow>()

    return row?.id ?? null
  }

  async function readItems(householdId: string, listId: string): Promise<ShoppingItem[]> {
    const result = await db
      .prepare(
        `${ITEM_SELECT}
         WHERE shopping_list_id = ?1 AND household_id = ?2
         ORDER BY is_checked ASC, created_at ASC, id ASC`,
      )
      .bind(listId, householdId)
      .all<ItemRow>()

    return result.results.map(toItem)
  }

  async function readList(householdId: string, listId: string): Promise<ShoppingList> {
    return {
      id: listId,
      items: await readItems(householdId, listId),
    }
  }

  async function readItem(householdId: string, itemId: string): Promise<ShoppingItem | null> {
    const row = await db
      .prepare(`${ITEM_SELECT} WHERE id = ?1 AND household_id = ?2`)
      .bind(itemId, householdId)
      .first<ItemRow>()

    return row ? toItem(row) : null
  }

  async function requireItem(householdId: string, itemId: string): Promise<ItemRow> {
    const row = await db
      .prepare(
        `${ITEM_SELECT}
         WHERE id = ?1 AND household_id = ?2`,
      )
      .bind(itemId, householdId)
      .first<ItemRow>()

    if (!row) {
      throw new DomainError('NOT_FOUND', 'Not found')
    }

    return row
  }

  async function findUncheckedProductItem(
    listId: string,
    householdId: string,
    productId: string,
  ): Promise<ItemRow | null> {
    return db
      .prepare(
        `${ITEM_SELECT}
         WHERE shopping_list_id = ?1
           AND household_id = ?2
           AND product_id = ?3
           AND is_checked = 0`,
      )
      .bind(listId, householdId, productId)
      .first<ItemRow>()
  }

  async function incrementUncheckedProduct(input: {
    listId: string
    householdId: string
    productId: string
    quantity: number
    unit: Unit
    now: string
  }): Promise<ShoppingItem | null> {
    await db.batch([
      db
        .prepare(
          `UPDATE shopping_items
           SET quantity = COALESCE(quantity, 0) + ?1,
               updated_at = ?2
           WHERE shopping_list_id = ?3
             AND household_id = ?4
             AND product_id = ?5
             AND is_checked = 0
             AND unit = ?6`,
        )
        .bind(input.quantity, input.now, input.listId, input.householdId, input.productId, input.unit),
    ])

    const row = await findUncheckedProductItem(input.listId, input.householdId, input.productId)
    if (!row || row.unit !== input.unit) {
      return null
    }

    return toItem(row)
  }

  return {
    async getOrCreateActiveList(input) {
      const existingId = await getActiveListId(input.householdId)
      if (existingId) {
        return readList(input.householdId, existingId)
      }

      const id = newId()
      const now = nowIso()

      try {
        await db
          .prepare(
            `INSERT INTO shopping_lists (id, household_id, status, created_at, updated_at)
             VALUES (?1, ?2, 'active', ?3, ?3)`,
          )
          .bind(id, input.householdId, now)
          .run()
        return readList(input.householdId, id)
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          throw error
        }

        const racedId = await getActiveListId(input.householdId)
        if (!racedId) {
          throw error
        }

        return readList(input.householdId, racedId)
      }
    },

    async getActiveList(input) {
      const listId = await getActiveListId(input.householdId)
      if (!listId) {
        return null
      }

      return readList(input.householdId, listId)
    },

    async addProductItem(input) {
      const quantity = validateQuantity(input.quantity)
      if (typeof input.unit !== 'string') {
        throw new DomainError('INVALID_UNIT', 'Invalid unit')
      }
      const unit = validateProductUnit(input.unit)
      const product = await products.getReadableProduct({
        householdId: input.householdId,
        productId: input.productId,
      })
      if (!product) {
        throw new DomainError('NOT_FOUND', 'Not found')
      }

      const { name, normalizedName } = validateShoppingItemName(product.name)
      const list = await this.getOrCreateActiveList({ householdId: input.householdId })

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const now = nowIso()
        const merged = await incrementUncheckedProduct({
          listId: list.id,
          householdId: input.householdId,
          productId: product.id,
          quantity,
          unit,
          now,
        })
        if (merged) {
          return merged
        }

        const existing = await findUncheckedProductItem(list.id, input.householdId, product.id)
        if (existing) {
          mergeShoppingQuantities(
            { quantity: existing.quantity, unit: existing.unit },
            { quantity, unit },
          )
          continue
        }

        const id = newId()
        try {
          await db
            .prepare(
              `INSERT INTO shopping_items (
                 id, shopping_list_id, household_id, product_id, name, normalized_name,
                 quantity, unit, is_checked, checked_at, created_by_user_id, created_at, updated_at
               ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, NULL, ?9, ?10, ?10)`,
            )
            .bind(
              id,
              list.id,
              input.householdId,
              product.id,
              name,
              normalizedName,
              quantity,
              unit,
              input.userId,
              now,
            )
            .run()

          const created = await readItem(input.householdId, id)
          if (!created) {
            throw new DomainError('NOT_FOUND', 'Not found')
          }
          return created
        } catch (error) {
          if (!isUniqueConstraintError(error)) {
            throw error
          }
        }
      }

      throw new DomainError('SHOPPING_UNIT_CONFLICT', 'Shopping item units do not match')
    },

    async addManualItem(input) {
      const { name, normalizedName } = validateShoppingItemName(input.name)
      const quantity = validateOptionalShoppingQuantity(input.quantity)
      const unit = validateOptionalShoppingUnit(input.unit)
      const list = await this.getOrCreateActiveList({ householdId: input.householdId })
      const id = newId()
      const now = nowIso()

      await db
        .prepare(
          `INSERT INTO shopping_items (
             id, shopping_list_id, household_id, product_id, name, normalized_name,
             quantity, unit, is_checked, checked_at, created_by_user_id, created_at, updated_at
           ) VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6, ?7, 0, NULL, ?8, ?9, ?9)`,
        )
        .bind(id, list.id, input.householdId, name, normalizedName, quantity, unit, input.userId, now)
        .run()

      const created = await readItem(input.householdId, id)
      if (!created) {
        throw new DomainError('NOT_FOUND', 'Not found')
      }
      return created
    },

    async toggleItem(input) {
      const row = await requireItem(input.householdId, input.itemId)
      const now = nowIso()

      if (input.checked) {
        await db
          .prepare(
            `UPDATE shopping_items
             SET is_checked = 1, checked_at = ?1, updated_at = ?1
             WHERE id = ?2 AND household_id = ?3`,
          )
          .bind(now, input.itemId, input.householdId)
          .run()

        const updated = await readItem(input.householdId, input.itemId)
        if (!updated) {
          throw new DomainError('NOT_FOUND', 'Not found')
        }
        return updated
      }

      const listIdRow = await db
        .prepare(
          `SELECT shopping_list_id AS id
           FROM shopping_items
           WHERE id = ?1 AND household_id = ?2`,
        )
        .bind(input.itemId, input.householdId)
        .first<ListIdRow>()

      if (!listIdRow) {
        throw new DomainError('NOT_FOUND', 'Not found')
      }

      if (row.product_id) {
        const sibling = await db
          .prepare(
            `${ITEM_SELECT}
             WHERE shopping_list_id = ?1
               AND household_id = ?2
               AND product_id = ?3
               AND is_checked = 0
               AND id != ?4`,
          )
          .bind(listIdRow.id, input.householdId, row.product_id, input.itemId)
          .first<ItemRow>()

        if (sibling) {
          const merged = mergeShoppingQuantities(
            { quantity: sibling.quantity, unit: sibling.unit },
            { quantity: row.quantity, unit: row.unit },
          )
          await db.batch([
            db
              .prepare(
                `UPDATE shopping_items
                 SET quantity = ?1, unit = ?2, updated_at = ?3
                 WHERE id = ?4 AND household_id = ?5`,
              )
              .bind(merged.quantity, merged.unit, now, sibling.id, input.householdId),
            db
              .prepare(`DELETE FROM shopping_items WHERE id = ?1 AND household_id = ?2`)
              .bind(input.itemId, input.householdId),
          ])

          const updatedSibling = await readItem(input.householdId, sibling.id)
          if (!updatedSibling) {
            throw new DomainError('NOT_FOUND', 'Not found')
          }
          return updatedSibling
        }
      }

      try {
        await db
          .prepare(
            `UPDATE shopping_items
             SET is_checked = 0, checked_at = NULL, updated_at = ?1
             WHERE id = ?2 AND household_id = ?3`,
          )
          .bind(now, input.itemId, input.householdId)
          .run()
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          throw error
        }

        throw new DomainError('SHOPPING_UNIT_CONFLICT', 'Shopping item units do not match')
      }

      const updated = await readItem(input.householdId, input.itemId)
      if (!updated) {
        throw new DomainError('NOT_FOUND', 'Not found')
      }
      return updated
    },

    async removeItem(input) {
      const deleted = await db
        .prepare(
          `DELETE FROM shopping_items
           WHERE id = ?1 AND household_id = ?2
           RETURNING id`,
        )
        .bind(input.itemId, input.householdId)
        .all<{ id: string }>()

      if (!deleted.results[0]) {
        throw new DomainError('NOT_FOUND', 'Not found')
      }
    },

    async clearCompleted(input) {
      const list = await this.getOrCreateActiveList({ householdId: input.householdId })
      await db
        .prepare(
          `DELETE FROM shopping_items
           WHERE shopping_list_id = ?1 AND household_id = ?2 AND is_checked = 1`,
        )
        .bind(list.id, input.householdId)
        .run()

      return readList(input.householdId, list.id)
    },
  }
}
