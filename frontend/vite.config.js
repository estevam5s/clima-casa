import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../backend/static', emptyOutDir: true, chunkSizeWarningLimit: 700,
    rollupOptions: { output: { manualChunks: { react: ['react', 'react-dom', 'react-router-dom'], graficos: ['recharts'], animacao: ['framer-motion'], supabase: ['@supabase/supabase-js'] } } },
  },
  server: { proxy: { '/api': 'http://127.0.0.1:8090', '/oauth': 'http://127.0.0.1:8090' } },
})
