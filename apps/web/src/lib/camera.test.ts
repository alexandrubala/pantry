import { expect, test } from 'vitest'
import {
  cameraErrorMessage,
  classifyCameraError,
  queryCameraPermission,
  setVideoTrackTorch,
  shouldRequestCamera,
  stopMediaStream,
  videoTrackSupportsTorch,
} from './camera'

test('classifies permission and missing-camera errors', () => {
  expect(classifyCameraError({ name: 'NotAllowedError' }, true)).toBe('permission')
  expect(classifyCameraError({ name: 'NotFoundError' }, true)).toBe('no-camera')
  expect(classifyCameraError({ name: 'NotReadableError' }, true)).toBe('in-use')
  expect(classifyCameraError(new Error('x'), false)).toBe('insecure')
})

test('uses Romanian camera copy and documents browser-owned permission', () => {
  expect(cameraErrorMessage('permission')).toMatch(/setările site-ului/)
  expect(cameraErrorMessage('denied')).toMatch(/Permite accesul la cameră/)
  expect(cameraErrorMessage('in-use')).toBe('Camera e folosită de altă aplicație. Închide-o și încearcă din nou.')
  expect(cameraErrorMessage('failed')).toBe('Nu putem accesa camera.')
})

test('stops every media track', () => {
  const stopped: string[] = []
  const stream = {
    getTracks: () => [
      { stop: () => stopped.push('a') },
      { stop: () => stopped.push('b') },
    ],
  } as unknown as MediaStream

  stopMediaStream(stream)
  expect(stopped).toEqual(['a', 'b'])
})

test('queries camera permission states and falls back when unsupported', async () => {
  expect(
    await queryCameraPermission({
      query: async () => ({ state: 'granted' }) as PermissionStatus,
    }),
  ).toBe('granted')
  expect(
    await queryCameraPermission({
      query: async () => ({ state: 'prompt' }) as PermissionStatus,
    }),
  ).toBe('prompt')
  expect(
    await queryCameraPermission({
      query: async () => ({ state: 'denied' }) as PermissionStatus,
    }),
  ).toBe('denied')
  expect(
    await queryCameraPermission({
      query: async () => {
        throw new Error('unsupported')
      },
    }),
  ).toBe('unknown')
  expect(await queryCameraPermission(undefined)).toBe('unknown')
  expect(shouldRequestCamera('granted')).toBe(true)
  expect(shouldRequestCamera('prompt')).toBe(true)
  expect(shouldRequestCamera('unknown')).toBe(true)
  expect(shouldRequestCamera('denied')).toBe(false)
})

test('hides torch when capability is absent', () => {
  const track = {
    getCapabilities: () => ({}),
  } as unknown as MediaStreamTrack
  expect(videoTrackSupportsTorch(track)).toBe(false)
  expect(videoTrackSupportsTorch(undefined)).toBe(false)
})

test('torch pressed state follows getSettings after a successful apply', async () => {
  let torch = false
  const track = {
    getCapabilities: () => ({ torch: true }),
    getSettings: () => ({ torch }),
    applyConstraints: async (constraints: { advanced: Array<{ torch?: boolean }> }) => {
      torch = Boolean(constraints.advanced[0]?.torch)
    },
  } as unknown as MediaStreamTrack

  const on = await setVideoTrackTorch(track, true)
  expect(on).toEqual({ ok: true, on: true })
  const off = await setVideoTrackTorch(track, false)
  expect(off).toEqual({ ok: true, on: false })
})

test('torch advertised but applyConstraints rejects disables torch', async () => {
  const track = {
    getCapabilities: () => ({ torch: true }),
    getSettings: () => ({ torch: false }),
    applyConstraints: async () => {
      throw new Error('not supported')
    },
  } as unknown as MediaStreamTrack

  expect(await setVideoTrackTorch(track, true)).toEqual({ ok: false, reason: 'failed' })
})

test('torch advertised but settings stay off is treated as failure', async () => {
  const track = {
    getCapabilities: () => ({ torch: true }),
    getSettings: () => ({ torch: false }),
    applyConstraints: async () => undefined,
  } as unknown as MediaStreamTrack

  expect(await setVideoTrackTorch(track, true)).toEqual({ ok: false, reason: 'failed' })
})
