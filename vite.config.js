import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const BASE = process.env.VITE_BASE || '/'   // auf Vercel z.B. '/Zeiterfassung/'

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.ico',
        'robots.txt',
        'apple-touch-icon.png',
      ],
      manifest: {
        name: 'Zeiterfassung',
        short_name: 'Zeiterfassung',
        start_url: BASE,       // wichtig im Sub-Pfad
        scope: BASE,           // dito
        display: 'standalone',
        background_color: '#0f766e',
        theme_color: '#0f766e',
        icons: [
          { src: 'icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/pwa-512x512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      // Optional – hilft beim lokalen Testen:
      // devOptions: { enabled: true }
    }),
  ],
  build: {
    outDir: 'dist',
  },
})
