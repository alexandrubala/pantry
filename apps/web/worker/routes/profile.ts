import { Hono } from 'hono'
import { resolveCurrentUser } from '../auth/session.js'
import { ensureProfile } from '../profiles/profile.js'

export const profile = new Hono<{ Bindings: CloudflareBindings }>()

profile.get('/profile', async (c) => {
  const user = await resolveCurrentUser(c.env, c.req.raw)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const current = await ensureProfile(c.env.DB, user)
  return c.json({
    id: current.id,
    displayName: current.displayName,
    avatarUrl: current.avatarUrl,
    locale: current.locale,
  })
})
