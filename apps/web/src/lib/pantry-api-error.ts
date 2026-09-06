import { isPantryApiError } from './api'

export const NETWORK_PANTRY_FAILURE_MESSAGE =
  'Nu avem conexiune. Verifică internetul și încearcă din nou.'
export const GENERIC_PANTRY_FAILURE_MESSAGE = 'Nu am putut salva. Încearcă din nou.'
export const HOUSEHOLD_NAME_INVALID_MESSAGE = 'Introdu un nume valid pentru casă.'
export const LOCATION_NAME_INVALID_MESSAGE = 'Introdu un nume valid pentru locație.'
export const LOCATION_NAME_TAKEN_MESSAGE = 'Există deja o locație cu acest nume.'
export const HOUSEHOLD_REQUIRED_MESSAGE = 'Configurează mai întâi casa.'
export const PRODUCT_NAME_INVALID_MESSAGE = 'Introdu un nume valid pentru produs.'
export const PRODUCT_BRAND_INVALID_MESSAGE = 'Introdu un brand valid.'
export const PRODUCT_UNIT_INVALID_MESSAGE = 'Alege o unitate validă.'
export const QUANTITY_INVALID_MESSAGE = 'Introdu o cantitate validă.'
export const EXPIRY_INVALID_MESSAGE = 'Introdu o dată de expirare validă.'
export const STOCK_CONFLICT_MESSAGE = 'Stocul s-a schimbat. Încearcă din nou.'
export const INVENTORY_CHANGED_MESSAGE = 'Stocul s-a schimbat. Reîncarcă și încearcă din nou.'
export const UNIT_IMMUTABLE_MESSAGE = 'Unitatea produsului nu mai poate fi schimbată.'
export const PRODUCT_NOT_FOUND_MESSAGE = 'Produsul nu a fost găsit.'
export const SHOPPING_UNIT_CONFLICT_MESSAGE =
  'Acest produs e deja pe listă cu altă unitate. Editează articolul existent.'
export const BARCODE_INVALID_MESSAGE = 'Introdu un cod de bare valid.'
export const BARCODE_TAKEN_MESSAGE = 'Există deja un produs cu acest cod de bare.'
export const CATALOG_UNAVAILABLE_MESSAGE = 'Nu am putut verifica produsul acum. Încearcă din nou.'
export const EMPTY_INVENTORY_MESSAGE = 'Nu ai produse în inventar. Adaugă sau scanează ceva înainte să gătești.'
export const AI_RATE_LIMIT_MESSAGE = 'Ai atins limita de 10 rețete pe oră. Încearcă mai târziu.'
export const AI_GENERATION_FAILED_MESSAGE =
  'Nu am putut genera o rețetă validă din inventarul tău. Încearcă din nou.'
export const AI_UNAVAILABLE_MESSAGE = 'Pantry nu poate genera o rețetă acum. Încearcă din nou.'
export const CONSTRAINT_NOT_MET_MESSAGE =
  'Nu am găsit o rețetă care să respecte țintele de calorii sau proteine. Încearcă din nou.'
export const FORBIDDEN_MESSAGE = 'Nu ai permisiunea să faci această acțiune.'
export const OWNER_CANNOT_LEAVE_MESSAGE =
  'Proprietarul nu poate părăsi casa. Transferul proprietății va fi disponibil ulterior.'
export const OWNER_CANNOT_REMOVE_SELF_MESSAGE = 'Nu poți să te elimini din casă.'
export const INVITE_EXPIRED_MESSAGE = 'Invitația a expirat.'
export const INVITE_REVOKED_MESSAGE = 'Invitația a fost anulată.'
export const INVITE_ALREADY_ACCEPTED_MESSAGE = 'Invitația a fost deja folosită.'
export const LOCATION_NOT_EMPTY_MESSAGE =
  'Mută sau consumă stocul din această locație înainte să o elimini.'
export const LAST_LOCATION_MESSAGE = 'Trebuie să rămână cel puțin o locație activă.'
export const RECEIPT_IMAGE_TOO_LARGE_MESSAGE =
  'Imaginea e prea mare. Fă o poză mai apropiată sau alege o imagine mai mică.'
export const RECEIPT_IMAGE_INVALID_MESSAGE = 'Alege o imagine JPEG, PNG sau WebP a bonului.'
export const RECEIPT_NO_ITEMS_MESSAGE = 'Nu am găsit produse pe acest bon. Încearcă o poză mai clară.'
export const RECEIPT_EXTRACTION_FAILED_MESSAGE = 'Nu am putut citi bonul. Încearcă din nou.'
export const RECEIPT_RATE_LIMIT_MESSAGE = 'Ai atins limita de scanări de bonuri pe oră. Încearcă mai târziu.'

export function insufficientStockMessage(availableLabel: string): string {
  return `Nu ai suficient stoc. Disponibil: ${availableLabel}`
}

export function aiRateLimitMessage(retryAfter: number | null): string {
  if (retryAfter == null || retryAfter <= 0) {
    return AI_RATE_LIMIT_MESSAGE
  }

  const minutes = Math.max(1, Math.ceil(retryAfter / 60))
  return `Ai atins limita de 10 rețete pe oră. Încearcă din nou în ${minutes} min.`
}

export function mapPantryApiError(error: unknown): string {
  if (isPantryApiError(error) && (error.status === 0 || error.code === 'NETWORK')) {
    return NETWORK_PANTRY_FAILURE_MESSAGE
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return NETWORK_PANTRY_FAILURE_MESSAGE
  }

  if (isPantryApiError(error)) {
    switch (error.code) {
      case 'INVALID_HOUSEHOLD_NAME':
        return HOUSEHOLD_NAME_INVALID_MESSAGE
      case 'INVALID_LOCATION_NAME':
        return LOCATION_NAME_INVALID_MESSAGE
      case 'LOCATION_NAME_TAKEN':
        return LOCATION_NAME_TAKEN_MESSAGE
      case 'LOCATION_NOT_EMPTY':
        return LOCATION_NOT_EMPTY_MESSAGE
      case 'LAST_LOCATION':
        return LAST_LOCATION_MESSAGE
      case 'HOUSEHOLD_REQUIRED':
        return HOUSEHOLD_REQUIRED_MESSAGE
      case 'INVALID_PRODUCT_NAME':
        return PRODUCT_NAME_INVALID_MESSAGE
      case 'INVALID_BRAND':
        return PRODUCT_BRAND_INVALID_MESSAGE
      case 'INVALID_UNIT':
        return PRODUCT_UNIT_INVALID_MESSAGE
      case 'INVALID_QUANTITY':
        return QUANTITY_INVALID_MESSAGE
      case 'INVALID_EXPIRY':
        return EXPIRY_INVALID_MESSAGE
      case 'STOCK_CONFLICT':
        return STOCK_CONFLICT_MESSAGE
      case 'INVENTORY_CHANGED':
        return INVENTORY_CHANGED_MESSAGE
      case 'UNIT_IMMUTABLE':
        return UNIT_IMMUTABLE_MESSAGE
      case 'NOT_FOUND':
        return PRODUCT_NOT_FOUND_MESSAGE
      case 'SHOPPING_UNIT_CONFLICT':
        return SHOPPING_UNIT_CONFLICT_MESSAGE
      case 'INVALID_BARCODE':
        return BARCODE_INVALID_MESSAGE
      case 'BARCODE_TAKEN':
        return BARCODE_TAKEN_MESSAGE
      case 'CATALOG_UNAVAILABLE':
        return CATALOG_UNAVAILABLE_MESSAGE
      case 'EMPTY_INVENTORY':
        return EMPTY_INVENTORY_MESSAGE
      case 'AI_RATE_LIMIT':
        return aiRateLimitMessage(error.retryAfter)
      case 'AI_GENERATION_FAILED':
      case 'INVALID_GENERATION_REQUEST':
        return AI_GENERATION_FAILED_MESSAGE
      case 'AI_UNAVAILABLE':
        return AI_UNAVAILABLE_MESSAGE
      case 'RECEIPT_IMAGE_TOO_LARGE':
        return RECEIPT_IMAGE_TOO_LARGE_MESSAGE
      case 'RECEIPT_IMAGE_INVALID':
        return RECEIPT_IMAGE_INVALID_MESSAGE
      case 'RECEIPT_NO_ITEMS':
        return RECEIPT_NO_ITEMS_MESSAGE
      case 'RECEIPT_EXTRACTION_FAILED':
        return RECEIPT_EXTRACTION_FAILED_MESSAGE
      case 'CONSTRAINT_NOT_MET':
        return CONSTRAINT_NOT_MET_MESSAGE
      case 'FORBIDDEN':
        return FORBIDDEN_MESSAGE
      case 'OWNER_CANNOT_LEAVE':
        return OWNER_CANNOT_LEAVE_MESSAGE
      case 'OWNER_CANNOT_REMOVE_SELF':
        return OWNER_CANNOT_REMOVE_SELF_MESSAGE
      case 'INVITE_EXPIRED':
        return INVITE_EXPIRED_MESSAGE
      case 'INVITE_REVOKED':
        return INVITE_REVOKED_MESSAGE
      case 'INVITE_ALREADY_ACCEPTED':
        return INVITE_ALREADY_ACCEPTED_MESSAGE
      case 'INSUFFICIENT_STOCK':
        return insufficientStockMessage(
          typeof error.available === 'number' ? String(error.available) : '0',
        )
      default:
        break
    }
  }

  return GENERIC_PANTRY_FAILURE_MESSAGE
}
