import { expect, test } from 'vitest'
import { initialScanView, reduceScanView, scanViewOpensCamera, scannerShouldStopStream } from './scan-view'

test('scan landing does not open the camera', () => {
  expect(initialScanView()).toEqual({ phase: 'idle' })
  expect(scanViewOpensCamera(initialScanView())).toBe(false)
})

test('close, manual, navigate, and detected all stop the stream', () => {
  expect(scannerShouldStopStream('close')).toBe(true)
  expect(scannerShouldStopStream('manual')).toBe(true)
  expect(scannerShouldStopStream('navigate')).toBe(true)
  expect(scannerShouldStopStream('detected')).toBe(true)
})

test('opening then closing returns to the idle scan screen', () => {
  const opened = reduceScanView(initialScanView(), { type: 'open-barcode' })
  expect(opened).toEqual({ phase: 'barcode' })
  expect(scanViewOpensCamera(opened)).toBe(true)
  expect(reduceScanView(opened, { type: 'close' })).toEqual({ phase: 'idle' })
})

test('manual entry and detection leave fullscreen scanner', () => {
  const opened = reduceScanView(initialScanView(), { type: 'open-barcode' })
  expect(reduceScanView(opened, { type: 'manual' }).phase).toBe('idle')
  expect(reduceScanView(opened, { type: 'detected' }).phase).toBe('lookup')
  expect(scanViewOpensCamera(reduceScanView(opened, { type: 'detected' }))).toBe(false)
})
