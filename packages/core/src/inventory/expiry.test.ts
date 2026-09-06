import { expect, test } from 'vitest'
import {
  addDaysIso,
  calendarDaysBetween,
  classifyExpiry,
  isExpiredLot,
  isExpiringSoonLot,
  parseExpiresOn,
  parseRequiredIsoDate,
} from './expiry.js'

const today = '2026-09-06'

test('parses DATE-ONLY expiry without timezone shifting', () => {
  expect(parseExpiresOn('2026-09-06')).toBe('2026-09-06')
  expect(parseExpiresOn(null)).toBe(null)
  expect(parseRequiredIsoDate('2026-09-06')).toBe('2026-09-06')
  expect(() => parseExpiresOn('2026-09-31')).toThrow()
})

test('classifies yesterday as expired and does not treat it as expiring soon', () => {
  expect(classifyExpiry('2026-09-05', today)).toBe('expired')
  expect(isExpiredLot('2026-09-05', today)).toBe(true)
  expect(isExpiringSoonLot('2026-09-05', today)).toBe(false)
})

test('classifies today, tomorrow, +7, and +8 without shifting the calendar date', () => {
  expect(classifyExpiry('2026-09-06', today)).toBe('today')
  expect(isExpiringSoonLot('2026-09-06', today)).toBe(true)

  expect(classifyExpiry('2026-09-07', today)).toBe('tomorrow')
  expect(isExpiringSoonLot('2026-09-07', today)).toBe(true)

  expect(classifyExpiry(addDaysIso(today, 7), today)).toBe('soon')
  expect(isExpiringSoonLot('2026-09-13', today)).toBe(true)

  expect(classifyExpiry(addDaysIso(today, 8), today)).toBe('later')
  expect(isExpiringSoonLot('2026-09-14', today)).toBe(false)
})

test('NULL expiry is neither expired nor expiring soon', () => {
  expect(classifyExpiry(null, today)).toBe('none')
  expect(isExpiredLot(null, today)).toBe(false)
  expect(isExpiringSoonLot(null, today)).toBe(false)
})

test('calendar day math stays on UTC date-only values', () => {
  expect(calendarDaysBetween(today, '2026-09-06')).toBe(0)
  expect(calendarDaysBetween(today, '2026-09-13')).toBe(7)
  expect(calendarDaysBetween(today, '2026-09-05')).toBe(-1)
  expect(addDaysIso('2026-09-30', 1)).toBe('2026-10-01')
})
