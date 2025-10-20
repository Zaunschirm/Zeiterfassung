import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const BASE = process.env.VITE_BASE || '/'   // auf Vercel z.B. '/Zeiterfassung/'

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
   VitePWA({
  manifest: {
    name: 'Zeiterfassung Zaunschirm',
    short_name: 'Zaunschirm',
    start_url: BASE,
    scope: BASE,
    display: 'standalone',
    theme_color: '#8B5A2B',
    background_color: '#18130F',
    icons: [
      { src: `${BASE}icons/pwa-192x192.png`, sizes: '192x192', type: 'image/png' },
      { src: `${BASE}icons/pwa-512x512.png`, sizes: '512x512', type: 'image/png' },
      { src: `${BASE}icons/pwa-512x512-maskable.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  }
})
,
  ],
  build: {
    outDir: 'dist',
  },
})
