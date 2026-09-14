import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const readBytes = path => readFile(new URL(`../${path}`, import.meta.url))

test('manifest exposes a standalone app and every required icon', async () => {
  const manifest = JSON.parse(await read('public/manifest.webmanifest'))

  assert.equal(manifest.id, '/')
  assert.equal(manifest.start_url, '/')
  assert.equal(manifest.scope, '/')
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.theme_color, '#03070c')
  assert.equal(manifest.background_color, '#03070c')
  assert.ok(manifest.icons.some(icon => icon.sizes === '192x192' && icon.purpose === 'any'))
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'any'))
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'maskable'))
})

test('install icons are real PNG files at their declared sizes', async () => {
  const expected = new Map([
    ['public/pwa/icon-192.png', 192],
    ['public/pwa/icon-512.png', 512],
    ['public/pwa/icon-maskable-512.png', 512],
    ['public/pwa/apple-touch-icon.png', 180],
  ])

  for (const [path, size] of expected) {
    const png = await readBytes(path)
    assert.equal(png.subarray(1, 4).toString(), 'PNG')
    assert.equal(png.readUInt32BE(16), size)
    assert.equal(png.readUInt32BE(20), size)
  }
})

test('HTML declares the manifest and Apple installation metadata', async () => {
  const html = await read('index.html')

  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/)
  assert.match(html, /rel="apple-touch-icon" href="\/pwa\/apple-touch-icon\.png"/)
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/)
  assert.match(html, /viewport-fit=cover/)
})

test('service worker keeps sensitive and live traffic network-only', async () => {
  const worker = await read('src/pwa/sw-template.js')

  for (const path of ['/screen', '/admin', '/captain', '/qr']) {
    assert.ok(worker.includes(`'${path}'`), `${path} must remain network-only`)
  }
  assert.match(worker, /request\.method !== 'GET'/)
  assert.match(worker, /url\.origin !== self\.location\.origin/)
  assert.doesNotMatch(worker, /addEventListener\(['"](?:sync|periodicsync)['"]/)
  assert.match(worker, /addEventListener\('push'/)
  assert.match(worker, /addEventListener\('notificationclick'/)
  assert.match(worker, /NOTIFICATION_ROUTES = new Set\(\['\/', '\/beer-pong', '\/missions'\]\)/)
  assert.match(worker, /clients\.matchAll\(\{ type: 'window', includeUncontrolled: true \}\)/)
  assert.match(worker, /clients\.openWindow\(destination\)/)
  const installHandler = worker.slice(
    worker.indexOf("self.addEventListener('install'"),
    worker.indexOf("self.addEventListener('activate'"),
  )
  assert.doesNotMatch(installHandler, /skipWaiting/)
  assert.match(worker, /event\.data\?\.type === 'SKIP_WAITING'/)
})

test('Android installation stays optional while iOS browser identity is blocked', async () => {
  const onboarding = await read('src/features/identity/HomeIdentityOnboarding.tsx')
  const installCard = await read('src/features/pwa/PwaInstallCard.tsx')
  const context = await read('src/features/pwa/PwaContext.tsx')
  const identityContext = await read('src/features/identity/PartyIdentityContext.tsx')
  const iosGate = await read('src/features/identity/IosInstallIdentityGate.tsx')

  assert.match(onboarding, /if \(requiresIosInstallation\) return <IosInstallIdentityGate \/>/)
  assert.match(installCard, /Plus tard/)
  assert.match(installCard, /pwa\.install\(\)/)
  assert.match(installCard, /pwa\.platform === 'android' && \(/)
  assert.match(installCard, /Sur l’écran d’accueil/)
  assert.match(identityContext, /if \(requiresIosInstallation\)[\s\S]*return false/)
  assert.match(iosGate, /Se déconnecter de Safari/)
  assert.match(iosGate, /releaseIdentity\(\)/)
  assert.match(context, /catch \(error\)[\s\S]*service worker n’a pas pu être enregistré/)
  assert.match(context, /if \(reloadRequested\.current\) window\.location\.reload\(\)/)
  assert.match(context, /reloadRequested\.current = true[\s\S]*postMessage\(\{ type: 'SKIP_WAITING' \}\)/)
})
