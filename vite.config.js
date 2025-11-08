// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/Zeiterfassung/',        // wichtig für GitHub Pages
  build: {
    outDir: 'dist',
  },
  define: {
    'process.env': {},
  },
})
