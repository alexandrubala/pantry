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
export const QUANTITY_INVALID_MESSAGE = 'Introdu o cantitate mai mare decât 0.'
export const EXPIRY_INVALID_MESSAGE = 'Introdu o dată de expirare validă.'
export const STOCK_CONFLICT_MESSAGE = 'Stocul s-a schimbat. Încearcă din nou.'
export const SHOPPING_UNIT_CONFLICT_MESSAGE =
  'Acest produs e deja pe listă cu altă unitate. Editează articolul existent.'
export const BARCODE_INVALID_MESSAGE = 'Introdu un cod de bare valid.'
export const BARCODE_TAKEN_MESSAGE = 'Există deja un produs cu acest cod de bare.'
export const CATALOG_UNAVAILABLE_MESSAGE = 'Nu am putut verifica produsul acum. Încearcă din nou.'

export function insufficientStockMessage(availableLabel: string): string {
  return `Nu ai suficient stoc. Disponibil: ${availableLabel}`
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
      case 'SHOPPING_UNIT_CONFLICT':
        return SHOPPING_UNIT_CONFLICT_MESSAGE
      case 'INVALID_BARCODE':
        return BARCODE_INVALID_MESSAGE
      case 'BARCODE_TAKEN':
        return BARCODE_TAKEN_MESSAGE
      case 'CATALOG_UNAVAILABLE':
        return CATALOG_UNAVAILABLE_MESSAGE
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
