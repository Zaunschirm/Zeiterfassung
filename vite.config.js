import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/Zeiterfassung/', // GitHub Pages Unterordner
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
      manifest: {
        name: 'Zeiterfassung Zaunschirm',
        short_name: 'Zeiterfassung',
        start_url: '/Zeiterfassung/#/',
        scope: '/Zeiterfassung/',
        display: 'standalone',
        theme_color: '#8B5E3C',
        background_color: '#12100E',
        icons: [
          { src: 'icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/pwa-512x512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ],
  build: { outDir: 'dist' }
})
