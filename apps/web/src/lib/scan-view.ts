export type ScanPhase = 'idle' | 'barcode' | 'receipt' | 'lookup' | 'result'

export type ScanViewState =
  | { phase: 'idle' }
  | { phase: 'barcode' }
  | { phase: 'receipt' }
  | { phase: 'lookup'; barcode: string }
  | { phase: 'result' }

export function initialScanView(): ScanViewState {
  return { phase: 'idle' }
}

export function scanViewOpensCamera(view: ScanViewState): boolean {
  return view.phase === 'barcode'
}

export type ScannerExitReason = 'close' | 'manual' | 'navigate' | 'detected' | 'escape' | 'back'

export function scannerShouldStopStream(_reason: ScannerExitReason): boolean {
  return true
}

export function reduceScanView(
  current: ScanViewState,
  action:
    | { type: 'open-barcode' }
    | { type: 'open-receipt' }
    | { type: 'close' }
    | { type: 'manual' }
    | { type: 'detected' },
): ScanViewState {
  switch (action.type) {
    case 'open-barcode':
      return { phase: 'barcode' }
    case 'open-receipt':
      return { phase: 'receipt' }
    case 'close':
    case 'manual':
      return { phase: 'idle' }
    case 'detected':
      return current.phase === 'barcode' ? { phase: 'lookup', barcode: '' } : current
    default:
      return current
  }
}
