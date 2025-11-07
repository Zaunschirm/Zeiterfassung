// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const RAW_BASE = process.env.VITE_BASE || '/Zeiterfassung'     // z.B. "/Zeiterfassung"
const BASE = RAW_BASE.endsWith('/') ? RAW_BASE : RAW_BASE + '/' // => immer mit Slash

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
      manifest: {
        name: 'Zeiterfassung Zaunschirm',
        short_name: 'Zeiterfassung',
        start_url: BASE,       // mit Slash
        scope: BASE,           // mit Slash
        display: 'standalone',
        theme_color: '#8B5E3C',
        background_color: '#12100E',
        icons: [
          { src: `${BASE}icons/pwa-192x192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${BASE}icons/pwa-512x512.png`, sizes: '512x512', type: 'image/png' },
          { src: `${BASE}icons/pwa-512x512-maskable.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  build: {
    outDir: 'dist',
    sourcemap: true, // damit du künftig Klartext-Fehler siehst
  },
})
