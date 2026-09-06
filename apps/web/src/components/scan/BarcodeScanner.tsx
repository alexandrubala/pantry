import { useEffect, useRef, useState } from 'react'
import { validateBarcode } from '@pantry/core'
import {
  cameraErrorMessage,
  classifyCameraError,
  openRearCamera,
  setVideoTrackTorch,
  stopMediaStream,
  videoTrackSupportsTorch,
  type CameraErrorReason,
} from '../../lib/camera'
import { selectBarcodeScanner } from '../../lib/scanner-backend'

type BarcodeDetectorInstance = {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>
}

type BarcodeDetectorWindowCtor = {
  new (options?: { formats?: string[] }): BarcodeDetectorInstance
  getSupportedFormats?: () => Promise<string[]>
}

type ZXingControls = {
  stop: () => void
}

export function BarcodeScanner({
  onDetected,
  onClose,
  onManual,
}: {
  onDetected: (barcode: string) => void
  onClose: () => void
  onManual: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const detectedRef = useRef(false)
  const onDetectedRef = useRef(onDetected)
  onDetectedRef.current = onDetected
  const [error, setError] = useState<CameraErrorReason | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const [torchOn, setTorchOn] = useState(false)
  const [torchAvailable, setTorchAvailable] = useState(false)
  const torchTrackRef = useRef<MediaStreamTrack | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) {
      return
    }

    let cancelled = false
    let stream: MediaStream | null = null
    let zxingControls: ZXingControls | null = null
    let raf = 0
    let delay = 0
    detectedRef.current = false

    function cleanup() {
      window.cancelAnimationFrame(raf)
      window.clearTimeout(delay)
      zxingControls?.stop()
      zxingControls = null
      stopMediaStream(stream)
      stream = null
      torchTrackRef.current = null
      if (video) {
        video.srcObject = null
      }
    }

    function acceptBarcode(raw: string) {
      if (detectedRef.current || cancelled) {
        return
      }

      try {
        const barcode = validateBarcode(raw)
        detectedRef.current = true
        if (typeof navigator.vibrate === 'function') {
          navigator.vibrate(50)
        }
        cleanup()
        onDetectedRef.current(barcode)
      } catch {
        // Keep scanning; checksum-invalid retail noise is ignored.
      }
    }

    async function startNative(formats: string[]) {
      const Detector = (window as Window & { BarcodeDetector?: BarcodeDetectorWindowCtor }).BarcodeDetector
      if (!Detector || !video) {
        throw new Error('native unavailable')
      }

      const detector = new Detector({ formats })

      const tick = async () => {
        if (cancelled || detectedRef.current) {
          return
        }

        try {
          if (video.readyState >= 2) {
            const codes = await detector.detect(video)
            const raw = codes.find((code) => code.rawValue)?.rawValue
            if (raw) {
              acceptBarcode(raw)
              return
            }
          }
        } catch {
          // Frame decode errors are expected; keep scanning.
        }

        delay = window.setTimeout(() => {
          raf = window.requestAnimationFrame(() => {
            void tick()
          })
        }, 120)
      }

      void tick()
    }

    async function startZxing() {
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
        import('@zxing/browser'),
        import('@zxing/library'),
      ])

      if (cancelled || !stream || !video) {
        return
      }

      const hints = new Map()
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
      ])
      const reader = new BrowserMultiFormatReader(hints)
      zxingControls = await reader.decodeFromStream(stream, video, (result) => {
        if (result) {
          acceptBarcode(result.getText())
        }
      })
    }

    async function start() {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError(classifyCameraError(new Error('unsupported'), window.isSecureContext))
        return
      }

      try {
        stream = await openRearCamera()
      } catch (cause) {
        if (!cancelled) {
          setError(classifyCameraError(cause, window.isSecureContext))
        }
        return
      }

      if (cancelled) {
        stopMediaStream(stream)
        stream = null
        return
      }

      if (!video) {
        stopMediaStream(stream)
        stream = null
        return
      }

      video.srcObject = stream
      video.playsInline = true
      video.muted = true
      video.setAttribute('playsinline', 'true')
      video.setAttribute('webkit-playsinline', 'true')
      await video.play().catch(() => undefined)

      const track = stream.getVideoTracks()[0]
      torchTrackRef.current = track ?? null
      setTorchAvailable(videoTrackSupportsTorch(track))

      const selection = await selectBarcodeScanner(
        (window as Window & { BarcodeDetector?: BarcodeDetectorWindowCtor }).BarcodeDetector,
      )

      if (cancelled) {
        cleanup()
        return
      }

      try {
        if (selection.backend === 'native') {
          await startNative(selection.formats)
        } else {
          await startZxing()
        }
      } catch {
        if (!cancelled) {
          await startZxing()
        }
      }
    }

    void start()

    return () => {
      cancelled = true
      cleanup()
    }
  }, [retryKey])

  async function toggleTorch() {
    const track = torchTrackRef.current
    if (!track || !videoTrackSupportsTorch(track)) {
      return
    }

    const next = !torchOn
    try {
      await setVideoTrackTorch(track, next)
      setTorchOn(next)
    } catch {
      setTorchAvailable(false)
    }
  }

  return (
    <div className="fixed inset-0 z-20 bg-black text-white">
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        autoPlay
        muted
        playsInline
      />
      <div className="pointer-events-none absolute inset-0 bg-black/25" />

      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top,0px))]">
        <button
          type="button"
          onClick={onClose}
          className="pointer-events-auto flex min-h-touch items-center rounded-lg bg-black/55 px-3 text-sm font-medium"
        >
          Închide
        </button>
        {torchAvailable ? (
          <button
            type="button"
            onClick={() => void toggleTorch()}
            className="pointer-events-auto flex min-h-touch items-center rounded-lg bg-black/55 px-3 text-sm font-medium"
            aria-pressed={torchOn}
          >
            Lanternă
          </button>
        ) : (
          <span />
        )}
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center px-8">
        <div className="h-24 w-full max-w-sm rounded-2xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        <p className="mt-4 text-center text-sm font-medium">Centrează codul de bare în chenar</p>
        <p className="mt-1 text-center text-sm text-white/80">Ține telefonul la 10–20 cm de cod.</p>
        {error ? <p className="mt-3 text-center text-sm text-white/90">{cameraErrorMessage(error)}</p> : null}
        {error === 'permission' || error === 'in-use' || error === 'failed' ? (
          <button
            type="button"
            className="pointer-events-auto mt-3 rounded-lg bg-white/90 px-3 py-2 text-sm font-medium text-black"
            onClick={() => {
              setError(null)
              setRetryKey((value) => value + 1)
            }}
          >
            Încearcă din nou
          </button>
        ) : null}
      </div>

      <div className="absolute inset-x-0 bottom-0 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))]">
        <button
          type="button"
          onClick={onManual}
          className="flex h-touch min-h-touch w-full items-center justify-center rounded-lg bg-white/90 text-sm font-medium text-black"
        >
          Introdu codul manual
        </button>
      </div>
    </div>
  )
}
