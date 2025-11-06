// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Basis-URL (z. B. /zeiterfassung auf Vercel oder GitHub Pages)
const BASE = process.env.VITE_BASE || '/'

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate', // Service Worker aktualisiert automatisch
      includeAssets: ['favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
      manifest: {
        name: 'Zeiterfassung Zaunschirm',
        short_name: 'Zeiterfassung',
        start_url: `${BASE}`,
        scope: `${BASE}`,
        display: 'standalone',
        description: 'Zeiterfassung – mobil & offline – Holzbau Zaunschirm',
        theme_color: '#8B5E3C',       // Holzbraun (Logo)
        background_color: '#12100E',  // Dunkles Braun / Schwarzbraun
        icons: [
          {
            src: `${BASE}icons/pwa-192x192.png`,
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: `${BASE}icons/pwa-512x512.png`,
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: `${BASE}icons/pwa-512x512-maskable.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  build: {
    outDir: 'dist',
  },
})
