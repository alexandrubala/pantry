export type CameraErrorReason =
  | 'permission'
  | 'no-camera'
  | 'insecure'
  | 'in-use'
  | 'unsupported'
  | 'failed'

export function cameraErrorMessage(reason: CameraErrorReason): string {
  if (reason === 'permission') {
    return 'Permite accesul la cameră pentru a scana codul.'
  }

  return 'Nu putem accesa camera.'
}

export function classifyCameraError(error: unknown, secureContext: boolean): CameraErrorReason {
  if (!secureContext) {
    return 'insecure'
  }

  if (!error || typeof error !== 'object') {
    return 'failed'
  }

  const name = 'name' in error && typeof error.name === 'string' ? error.name : ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return 'permission'
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'no-camera'
  }
  if (name === 'NotReadableError' || name === 'AbortError' || name === 'TrackStartError') {
    return 'in-use'
  }
  if (name === 'NotSupportedError' || name === 'TypeError') {
    return 'unsupported'
  }

  return 'failed'
}

export function stopMediaStream(stream: MediaStream | null | undefined) {
  if (!stream) {
    return
  }

  for (const track of stream.getTracks()) {
    track.stop()
  }
}

export function videoTrackSupportsTorch(track: MediaStreamTrack | undefined): boolean {
  if (!track || typeof track.getCapabilities !== 'function') {
    return false
  }

  const capabilities = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean }
  return capabilities.torch === true
}

export async function setVideoTrackTorch(track: MediaStreamTrack, on: boolean): Promise<void> {
  await track.applyConstraints({
    advanced: [{ torch: on } as MediaTrackConstraintSet],
  })
}
