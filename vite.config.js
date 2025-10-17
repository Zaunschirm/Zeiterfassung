import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = env.VITE_BASE || '/Zeiterfassung/'
  return {
    base,
    plugins: [react()],
    server: { port: 5173, host: true },
    build: { outDir: 'dist' }
  }
})
