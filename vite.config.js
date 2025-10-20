// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Vercel: VITE_BASE kommt aus deinen Env-Vars (/Zeiterfassung/) – lokal ist es "/"
const BASE = process.env.VITE_BASE || '/'

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      // Service Worker wird automatisch erzeugt & aktualisiert
      registerType: 'autoUpdate',

      // optionale zusätzliche statische Assets
      includeAssets: [
        'favicon.ico',
        'robots.txt',
        'apple-touch-icon.png'
      ],

      // Manifest für die „Installierbare App“
      manifest: {
        name: 'Zeiterfassung',
        short_name: 'Zeiterfassung',
        start_url: BASE,         // wichtig, damit PWA im richtigen Unterpfad startet
        scope: BASE,
        display: 'standalone',
        description: 'Zeiterfassung – mobil & offline',
        theme_color: '#0f766e',
        background_color: '#0f766e',
        icons: [
          { src: `${BASE}icons/pwa-192x192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${BASE}icons/pwa-512x512.png`, sizes: '512x512', type: 'image/png' },
          { src: `${BASE}icons/pwa-512x512-maskable.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ],
  build: {
    outDir: 'dist'
  }
})
