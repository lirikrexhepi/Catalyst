import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { fileIcons } from '../../../tools/vite-file-icons'

const here = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [
    react(),
    // Falls back to the desktop app's copy until this package is installed here.
    fileIcons({
      packageDirs: [here + 'node_modules/material-icon-theme', here + '../../../frontend/node_modules/material-icon-theme'],
    }),
  ],
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:4545',
    },
  },
})
