import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { fileIcons } from '../../../tools/vite-file-icons'

const here = fileURLToPath(new URL('.', import.meta.url))

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version?: string }

function buildCommit(): string {
  const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA
  if (fromVercel) return fromVercel.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { cwd: here, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version ?? ''),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUILD_COMMIT__: JSON.stringify(buildCommit()),
  },
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
