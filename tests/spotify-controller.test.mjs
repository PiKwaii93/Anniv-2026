// Exercise the real hook with React and a DOM; Spotify calls use in-memory replies.
import assert from 'node:assert/strict'
import test, { after, afterEach, beforeEach } from 'node:test'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import React, { act, useLayoutEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import { build } from 'vite'

const cache = resolve('node_modules/.cache/spotify-controller-test.mjs')
const bundle = await build({ configFile: false, logLevel: 'error', plugins: [{
  name: 'spotify-api-fixture',
  enforce: 'pre',
  resolveId(id, importer) {
    if (id === './api' && importer?.endsWith('/spotify/useSpotify.ts')) return '\0spotify-api-fixture'
  },
  load(id) {
    if (id === '\0spotify-api-fixture') return 'export const spotifyAction = (...args) => globalThis.__spotifyAction(...args)'
  },
}], build: { ssr: resolve('src/features/spotify/useSpotify.ts'), write: false, minify: false } })
await mkdir(resolve('node_modules/.cache'), { recursive: true })
await writeFile(cache, bundle.output.find((item) => item.type === 'chunk').code)
const { useSpotify } = await import(pathToFileURL(cache).href)
after(() => rm(cache))

let dom, root, controller, poll
let replies = []
const requests = []
const state = { connected: true, device_id: 'pc', device_name: 'PC', devices: [], dispatches: {}, playback: null }
const status = (value = state) => ({ action: 'status', value })
const unavailable = new Error('Spotify ne répond pas pour le moment.')

function Probe() {
  const current = useSpotify()
  useLayoutEffect(() => { controller = current })
  return null
}
async function mount(...responses) {
  replies.push(...responses)
  await act(async () => root.render(React.createElement(Probe)))
}
beforeEach(() => {
  dom = new JSDOM('<div id="root"></div>')
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  dom.window.setInterval = (callback) => { poll = callback; return 1 }
  dom.window.clearInterval = () => {}
  Object.defineProperty(document, 'visibilityState', { value: 'visible' })
  root = createRoot(document.getElementById('root'))
  replies = []; requests.length = 0
  globalThis.__spotifyAction = async (action) => {
    requests.push(action)
    const next = replies.shift()
    assert.equal(action, next?.action, 'Unexpected Spotify request')
    if (next.value instanceof Error) throw next.value
    return next.value
  }
})
afterEach(async () => {
  await act(async () => root.unmount())
  dom.window.close()
  delete globalThis.window
  delete globalThis.document
  delete globalThis.IS_REACT_ACT_ENVIRONMENT
  delete globalThis.__spotifyAction
  assert.equal(replies.length, 0)
})

test('manual refresh clears a failed status request and restores the current state', async () => {
  await mount(status(unavailable))
  assert.equal(controller.error, unavailable.message)
  replies.push(status())
  await act(async () => controller.refresh())
  assert.equal(controller.error, '')
  assert.equal(controller.data.device_id, 'pc')
})

test('automatic polling clears a status error without repeating a successful command', async () => {
  await mount(status())
  replies.push({ action: 'pause', value: { ok: true } }, status(unavailable))
  await act(async () => assert.equal(await controller.run('pause'), true))
  assert.equal(controller.error, unavailable.message)
  assert.equal(controller.data.device_id, 'pc')
  assert.equal(controller.notice, 'Commande enregistrée.')
  replies.push(status())
  await act(async () => poll())
  assert.equal(controller.error, '')
  assert.equal(requests.filter((action) => action === 'pause').length, 1)
})

test('an uncertain queue command remains visible after successful status refreshes', async () => {
  const uncertain = new Error('Vérifie la file Spotify avant de renvoyer ce morceau.')
  await mount(status())
  replies.push({ action: 'queue', value: uncertain }, status())
  await act(async () => assert.equal(await controller.run('queue', { song_id: 'test' }), false))
  assert.equal(controller.error, uncertain.message)
  replies.push(status())
  await act(async () => poll())
  assert.equal(controller.error, uncertain.message)
  assert.equal(requests.filter((action) => action === 'queue').length, 1)
})

test('a failed status refresh cannot replace the explanation of a failed command', async () => {
  const rejected = new Error('Spotify refuse cette commande.')
  await mount(status())
  replies.push({ action: 'play', value: rejected }, status(unavailable))
  await act(async () => assert.equal(await controller.run('play'), false))
  assert.equal(controller.error, rejected.message)
  replies.push({ action: 'play', value: { ok: true } }, status())
  await act(async () => assert.equal(await controller.run('play'), true))
  assert.equal(controller.error, '')
})
