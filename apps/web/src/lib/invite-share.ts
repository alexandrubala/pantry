export function canUseWebShare(
  share: unknown = typeof navigator === 'undefined' ? undefined : navigator.share,
): boolean {
  return typeof share === 'function'
}

export function invitePath(token: string): string {
  return `/invite/${token}`
}

export function inviteUrl(origin: string, token: string): string {
  return `${origin}${invitePath(token)}`
}

export function inviteSharePayload(householdName: string, url: string) {
  return {
    title: 'Invitație Pantry',
    text: `Te invit în ${householdName} pe Pantry.`,
    url,
  }
}
