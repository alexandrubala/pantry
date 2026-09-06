import { expect, test } from 'vitest'
import { consumePercentQuantity, roundHalfToEven } from './consume-percent.js'

test('1000 ml percentages are exact', () => {
  expect(consumePercentQuantity(1000, 25, 'ml')).toBe(250)
  expect(consumePercentQuantity(1000, 50, 'ml')).toBe(500)
  expect(consumePercentQuantity(1000, 75, 'ml')).toBe(750)
  expect(consumePercentQuantity(1000, 100, 'ml')).toBe(1000)
})

test('10 each uses banker’s rounding to whole pieces', () => {
  expect(roundHalfToEven(2.5)).toBe(2)
  expect(roundHalfToEven(7.5)).toBe(8)
  expect(consumePercentQuantity(10, 25, 'each')).toBe(2)
  expect(consumePercentQuantity(10, 50, 'each')).toBe(5)
  expect(consumePercentQuantity(10, 75, 'each')).toBe(8)
  expect(consumePercentQuantity(10, 100, 'each')).toBe(10)
})

test('package percentages stay whole', () => {
  expect(consumePercentQuantity(10, 25, 'package')).toBe(2)
  expect(consumePercentQuantity(10, 50, 'package')).toBe(5)
  expect(consumePercentQuantity(10, 75, 'package')).toBe(8)
  expect(consumePercentQuantity(10, 100, 'package')).toBe(10)
})

test('1 each never generates 0 consumption', () => {
  expect(consumePercentQuantity(1, 25, 'each')).toBe(1)
  expect(consumePercentQuantity(1, 50, 'each')).toBe(1)
  expect(consumePercentQuantity(1, 75, 'each')).toBe(1)
  expect(consumePercentQuantity(1, 100, 'each')).toBe(1)
})

test('1 package never generates 0 consumption', () => {
  expect(consumePercentQuantity(1, 25, 'package')).toBe(1)
  expect(consumePercentQuantity(1, 50, 'package')).toBe(1)
  expect(consumePercentQuantity(1, 75, 'package')).toBe(1)
  expect(consumePercentQuantity(1, 100, 'package')).toBe(1)
})

test('g/ml keep decimal quantities', () => {
  expect(consumePercentQuantity(250, 25, 'g')).toBe(62.5)
  expect(consumePercentQuantity(3, 25, 'ml')).toBe(0.75)
})

test('tiny continuous stock still consumes something', () => {
  expect(consumePercentQuantity(0.001, 25, 'g')).toBe(0.001)
})
