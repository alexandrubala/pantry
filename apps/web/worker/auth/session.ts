import { createAuth } from './auth.js'
import type { ProfileIdentity } from '../profiles/profile.js'

export async function resolveCurrentUser(
  env: CloudflareBindings,
  request: Request,
): Promise<ProfileIdentity | null> {
  const session = await createAuth(env).api.getSession({
    headers: request.headers,
  })

  if (!session?.user?.id) {
    return null
  }

  return {
    id: session.user.id,
    name: session.user.name,
  }
}
