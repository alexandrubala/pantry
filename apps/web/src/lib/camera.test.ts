import { expect, test } from 'vitest'
import { applyContinuousFocus, cameraErrorMessage, classifyCameraError, stopMediaStream } from './camera'

test('classifies permission and missing-camera errors', () => {
  expect(classifyCameraError({ name: 'NotAllowedError' }, true)).toBe('permission')
  expect(classifyCameraError({ name: 'NotFoundError' }, true)).toBe('no-camera')
  expect(classifyCameraError({ name: 'NotReadableError' }, true)).toBe('in-use')
  expect(classifyCameraError(new Error('x'), false)).toBe('insecure')
})

test('uses Romanian camera copy', () => {
  expect(cameraErrorMessage('permission')).toBe('Permite accesul la cameră pentru a scana codul.')
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

test('applies continuous focus only when the capability exists', async () => {
  const applied: unknown[] = []
  const track = {
    getCapabilities: () => ({ focusMode: ['continuous'] }),
    applyConstraints: async (constraints: unknown) => {
      applied.push(constraints)
    },
  } as unknown as MediaStreamTrack

  await applyContinuousFocus(track)
  expect(applied).toEqual([{ advanced: [{ focusMode: 'continuous' }] }])
})

test('classifies permission and missing-camera errors', () => {
  expect(classifyCameraError({ name: 'NotAllowedError' }, true)).toBe('permission')
  expect(classifyCameraError({ name: 'NotFoundError' }, true)).toBe('no-camera')
  expect(classifyCameraError({ name: 'NotReadableError' }, true)).toBe('in-use')
  expect(classifyCameraError(new Error('x'), false)).toBe('insecure')
})

test('uses Romanian camera copy', () => {
  expect(cameraErrorMessage('permission')).toBe('Permite accesul la cameră pentru a scana codul.')
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
