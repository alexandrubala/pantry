import { isPantryApiError } from './api'

export const NETWORK_PANTRY_FAILURE_MESSAGE =
  'Nu avem conexiune. Verifică internetul și încearcă din nou.'
export const GENERIC_PANTRY_FAILURE_MESSAGE = 'Nu am putut salva. Încearcă din nou.'
export const HOUSEHOLD_NAME_INVALID_MESSAGE = 'Introdu un nume valid pentru casă.'
export const LOCATION_NAME_INVALID_MESSAGE = 'Introdu un nume valid pentru locație.'
export const LOCATION_NAME_TAKEN_MESSAGE = 'Există deja o locație cu acest nume.'
export const HOUSEHOLD_REQUIRED_MESSAGE = 'Configurează mai întâi casa.'

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
      default:
        break
    }
  }

  return GENERIC_PANTRY_FAILURE_MESSAGE
}
