import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Im Dev-Server gehen API und Admin-Oberfläche an PocketBase (server/README.md, „Lokal entwickeln“),
// damit die App wie in Produktion alles unter ihrer eigenen Adresse anspricht.
const backend = process.env.PB_URL ?? 'http://127.0.0.1:8090'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': backend,
      '/_': backend,
    },
  },
})
