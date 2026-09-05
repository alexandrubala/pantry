import { UNITS, type Unit } from '../types'

export function isUnit(value: string): value is Unit {
  return (UNITS as readonly string[]).includes(value)
}
