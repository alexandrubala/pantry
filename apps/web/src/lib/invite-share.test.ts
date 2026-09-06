import { expect, test } from 'vitest'
import { canUseWebShare, invitePath, inviteSharePayload, inviteUrl } from './invite-share'

test('builds a share payload with the full invitation URL', () => {
  expect(invitePath('abc')).toBe('/invite/abc')
  expect(inviteUrl('https://pantry.example', 'tok_en-1')).toBe('https://pantry.example/invite/tok_en-1')
  expect(inviteSharePayload('Casa mea', 'https://pantry.example/invite/tok')).toEqual({
    title: 'Invitație Pantry',
    text: 'Te invit în Casa mea pe Pantry.',
    url: 'https://pantry.example/invite/tok',
  })
})

test('hides share when navigator.share is missing', () => {
  expect(canUseWebShare(undefined)).toBe(false)
  expect(canUseWebShare(async () => undefined)).toBe(true)
})
