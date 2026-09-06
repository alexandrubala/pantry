import { matchReceiptProduct } from './match.js'
import { suggestReceiptImportQuantity } from './quantity.js'
import type { ReceiptDraft, ReceiptDraftLine, ReceiptProductMatch } from './types.js'

export function annotateReceiptDraft(
  draft: ReceiptDraft,
  products: readonly ReceiptProductMatch[],
): ReceiptDraftLine[] {
  return draft.items.map((item) => {
    const suggestedProduct = matchReceiptProduct(item.name, products)
    const suggestion = suggestReceiptImportQuantity({ item, product: suggestedProduct })
    return {
      ...item,
      suggestedProduct,
      suggestedQuantity: suggestion.quantity,
      suggestedUnit: suggestion.unit,
    }
  })
}
