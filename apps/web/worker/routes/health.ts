import { Hono } from 'hono'

export const APP_VERSION = '0.1.0'

export const health = new Hono<{ Bindings: CloudflareBindings }>()

health.get('/health', async (c) => {
  try {
    await c.env.DB.prepare('SELECT 1').first()
    return c.json({
      ok: true,
      service: 'pantry',
      version: APP_VERSION,
      database: 'ok',
    })
  } catch {
    console.error(JSON.stringify({ message: 'database health check failed' }))
    return c.json(
      {
        ok: false,
        service: 'pantry',
        version: APP_VERSION,
        database: 'unavailable',
      },
      503,
    )
  }
})
