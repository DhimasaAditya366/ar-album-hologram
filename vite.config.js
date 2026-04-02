import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// BASE_URL env var menentukan base path:
//   GitHub Pages : BASE_URL=/ar-album-hologram/  npm run build
//   Hostinger    : BASE_URL=/                     npm run build  (atau tidak diset)
const REPO_NAME = 'ar-album-hologram'
const base = process.env.BASE_URL ?? (process.env.NODE_ENV === 'production' ? `/${REPO_NAME}/` : '/')

export default defineConfig({
  plugins: [
    react(),
    basicSsl(), // HTTPS self-signed cert → kamera HP bisa jalan via LAN
  ],
  base,
  server: {
    host: true,   // expose ke LAN (0.0.0.0)
    port: 5173,
    https: true,  // aktifkan HTTPS
  },
  optimizeDeps: {
    exclude: ['mind-ar'],
  },
  build: {
    chunkSizeWarningLimit: 3000, // mind-ar memang besar, suppress warning
  },
})
