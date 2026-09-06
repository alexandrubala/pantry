import { Hono } from 'hono'
import { health } from './routes/health.js'

const app = new Hono<{ Bindings: CloudflareBindings }>()

app.route('/api/v1', health)

export default app
export { app }
