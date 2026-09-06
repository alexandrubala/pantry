import { Hono } from 'hono'
import { createAuth } from './auth/auth.js'
import { health } from './routes/health.js'
import { households } from './routes/households.js'
import { locations } from './routes/locations.js'
import { profile } from './routes/profile.js'

const app = new Hono<{ Bindings: CloudflareBindings }>()

app.route('/api/v1', health)
app.route('/api/v1', profile)
app.route('/api/v1', households)
app.route('/api/v1', locations)

app.all('/api/auth/*', (c) => createAuth(c.env).handler(c.req.raw))

export default app
export { app }
