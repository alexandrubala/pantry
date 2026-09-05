import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/** Pantry light background: oklch(0.985 0.006 148) */
const pantryBackground = '#f7fbf8'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    // After the framework plugin, per Cloudflare Vite plugin docs.
    cloudflare(),
    // Restrict PWA generation to the Vite client environment so Workbox
    // artifacts are not emitted into the Worker build output.
    ...VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // Icons and public assets are picked up once via workbox.globPatterns.
      includeManifestIcons: false,
      manifest: {
        name: 'Pantry',
        short_name: 'Pantry',
        description: 'Shared household inventory and smart pantry companion.',
        lang: 'ro',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        theme_color: pantryBackground,
        background_color: pantryBackground,
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        navigateFallback: 'index.html',
        // Keep /api/* on the network. Do not treat API traffic as app-shell
        // navigations or offline application data (offline snapshots are Task 10.2).
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
      },
      // Normal Vite HMR stays unencumbered. Opt in with SW_DEV=true to test the SW.
      devOptions: {
        enabled: process.env.SW_DEV === 'true',
      },
    }).map((plugin) => ({
      ...plugin,
      applyToEnvironment(environment: { name: string }) {
        return environment.name === 'client'
      },
    })),
  ],
})
