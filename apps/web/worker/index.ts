import { Hono } from 'hono'

const app = new Hono()

app.get('/api/dev/ping', (c) =>
  c.json({
    ok: true,
    runtime: 'cloudflare-worker',
  }),
)

export default app
