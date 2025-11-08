import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/Zeiterfassung/', // GitHub Pages Basis-Pfad
  build: {
    outDir: 'dist',
  },
  define: {
    'process.env': {}, // fix für React in Vite
  },
})
