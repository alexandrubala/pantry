import { Hono } from 'hono'
import { createAuth } from './auth/auth.js'
import { health } from './routes/health.js'

const app = new Hono<{ Bindings: CloudflareBindings }>()

app.route('/api/v1', health)

app.all('/api/auth/*', (c) => createAuth(c.env).handler(c.req.raw))

export default app
export { app }
