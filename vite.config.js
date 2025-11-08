import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ✅ Vollständige Konfiguration für GitHub Pages + Cache-Busting
export default defineConfig({
  plugins: [react()],
  base: '/Zeiterfassung/', // <- exakt so (mit Slash am Anfang und Ende)
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
})
