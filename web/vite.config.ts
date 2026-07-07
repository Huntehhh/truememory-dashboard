import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/app/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      // Simulator + SSE live off the FastAPI sidecar (127.0.0.1:8504). The
      // /api/sim prefix is stripped so dev matches prod semantics — in prod
      // Express does the same rewrite before reverse-proxying to 8504.
      // NOTE: order matters here. Vite's proxy walks keys in insertion order
      //       and the first startsWith-match wins, so the more-specific
      //       '/api/sim' rule MUST sit above the '/api' catch-all.
      '/api/sim': {
        target: 'http://127.0.0.1:8504',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/sim/, ''),
      },
      '/api': 'http://127.0.0.1:8503',
    },
  },
})
