import { Hono } from 'hono'

const app = new Hono<{ Bindings: CloudflareBindings }>()

app.get('/api/dev/ping', async (c) => {
  await c.env.DB.prepare('SELECT 1').first()
  return c.json({
    ok: true,
    runtime: 'cloudflare-worker',
    db: true,
  })
})

export default app
