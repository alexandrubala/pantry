import { betterAuth } from 'better-auth'
import { ensureProfile } from '../profiles/profile.js'

function createAuthInstance(env: CloudflareBindings) {
  return betterAuth({
    appName: 'Pantry',
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: '/api/auth',
    emailAndPassword: {
      enabled: true,
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            try {
              await ensureProfile(env.DB, { id: user.id, name: user.name })
            } catch {
              console.error(JSON.stringify({ message: 'ensureProfile after signup failed' }))
            }
          },
        },
      },
    },
  })
}

type Auth = ReturnType<typeof createAuthInstance>

const authByDatabase = new WeakMap<D1Database, Auth>()

export function createAuth(env: CloudflareBindings): Auth {
  const cached = authByDatabase.get(env.DB)
  if (cached) {
    return cached
  }

  const auth = createAuthInstance(env)
  authByDatabase.set(env.DB, auth)
  return auth
}
