import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // El bundle único (~1.2MB) es esperado para esta SPA monolítica; se sube
    // el límite del warning en vez de forzar code-splitting fuera de alcance.
    chunkSizeWarningLimit: 1500,
  },
})
