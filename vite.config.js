import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
      manifest: {
        name: 'Holzbau Zaunschirm Zeiterfassung',
        short_name: 'Zeiterfassung',
        description: 'Interne Zeiterfassungs-App von Holzbau Zaunschirm.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#7A5A3A',        // CI-Braun (anpassbar)
        background_color: '#F2E9DC',   // helles CI-Beige (anpassbar)
        icons: [
          { src: '/icons/icon-192.png',      sizes: '192x192',  type: 'image/png' },
          { src: '/icons/icon-256.png',      sizes: '256x256',  type: 'image/png' },
          { src: '/icons/icon-384.png',      sizes: '384x384',  type: 'image/png' },
          { src: '/icons/icon-512.png',      sizes: '512x512',  type: 'image/png' },
          { src: '/icons/maskable-192.png',  sizes: '192x192',  type: 'image/png', purpose: 'maskable' },
          { src: '/icons/maskable-512.png',  sizes: '512x512',  type: 'image/png', purpose: 'maskable' }
        ],
        shortcuts: [
          {
            name: 'Zeiterfassung',
            url: '/#/zeiterfassung',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }]
          },
          { name: 'Monatsübersicht', url: '/#/monatsuebersicht' },
          { name: 'Projektfotos',    url: '/#/projektfotos' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          // Supabase -> immer zuerst Netzwerk, aber offline fallback
          {
            urlPattern: /^https:\/\/[^/]+\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase',
              networkTimeoutSeconds: 5
            }
          },
          // Bilder effizient cachen
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          }
        ]
      },
      devOptions: { enabled: true } // macht PWA auch im dev-Server aktiv
    })
  ]
})
