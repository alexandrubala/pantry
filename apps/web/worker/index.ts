import { Hono } from 'hono'
import { createAuth } from './auth/auth.js'
import { health } from './routes/health.js'
import { households } from './routes/households.js'
import { inventory } from './routes/inventory.js'
import { locations } from './routes/locations.js'
import { products } from './routes/products.js'
import { barcodes } from './routes/barcodes.js'
import { profile } from './routes/profile.js'
import { shopping } from './routes/shopping.js'
import { ai } from './routes/ai.js'
import { recipes } from './routes/recipes.js'

const app = new Hono<{ Bindings: CloudflareBindings }>()

app.route('/api/v1', health)
app.route('/api/v1', profile)
app.route('/api/v1', households)
app.route('/api/v1', locations)
app.route('/api/v1', products)
app.route('/api/v1', barcodes)
app.route('/api/v1', inventory)
app.route('/api/v1', shopping)
app.route('/api/v1', ai)
app.route('/api/v1', recipes)

app.all('/api/auth/*', (c) => createAuth(c.env).handler(c.req.raw))

export default app
export { app }
