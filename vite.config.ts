import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

function conservativePwaServiceWorker(): Plugin {
  return {
    name: 'anniv-2026-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const generatedAssets = Object.values(bundle)
        .filter(item => (
          item.type === 'chunk'
            ? item.isEntry
            : /^assets\/index-[^/]+\.css$/.test(item.fileName)
        ))
        .map(item => `/${item.fileName}`)
      const precacheUrls = [
        '/',
        '/index.html',
        '/manifest.webmanifest',
        '/favicon.svg',
        '/pwa/icon-192.png',
        '/pwa/icon-512.png',
        '/pwa/icon-maskable-512.png',
        '/pwa/apple-touch-icon.png',
        ...generatedAssets,
      ]
      const buildId = `${Date.now().toString(36)}-${generatedAssets.length}`
      const source = readFileSync(resolve('src/pwa/sw-template.js'), 'utf8')
        .replace('__BUILD_ID__', buildId)
        .replace('__PRECACHE_URLS__', JSON.stringify(precacheUrls))

      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), conservativePwaServiceWorker()],
})
