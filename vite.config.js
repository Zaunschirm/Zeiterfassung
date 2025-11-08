import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/Zeiterfassung/',     // wichtig für GitHub Pages
  plugins: [react()],
  build: { outDir: 'dist' },
  define: { 'process.env': {} },
});
