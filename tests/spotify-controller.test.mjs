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
    if (id.endsWith('virtual:spotify-ui')) return '\0spotify-ui'
    if (id === './api' && (importer?.endsWith('/spotify/useSpotify.ts') || importer?.endsWith('/spotify/GuestSongPicker.tsx'))) return '\0spotify-api-fixture'
  },
  load(id) {
    if (id === '\0spotify-ui') return `export {useSpotify} from ${JSON.stringify(resolve('src/features/spotify/useSpotify.ts'))}; export {default as SpotifySongAction} from ${JSON.stringify(resolve('src/features/spotify/SpotifySongAction.tsx'))}; export {default as GuestSongPicker} from ${JSON.stringify(resolve('src/features/spotify/GuestSongPicker.tsx'))};`
    if (id === '\0spotify-api-fixture') return 'export const spotifyAction = (...args) => globalThis.__spotifyAction(...args)'
  },
}], build: { ssr: 'virtual:spotify-ui', write: false, minify: false } })
await mkdir(resolve('node_modules/.cache'), { recursive: true })
await writeFile(cache, bundle.output.find((item) => item.type === 'chunk').code)
const { useSpotify, SpotifySongAction, GuestSongPicker } = await import(pathToFileURL(cache).href)
after(() => rm(cache))

let dom, root, controller, poll, showCard, refreshes
let replies = []
const requests = [], payloads = []
const state = { connected: true, device_id: 'pc', device_name: 'PC', devices: [], dispatches: {}, playback: null }
const status = (value = state) => ({ action: 'status', value })
const unavailable = new Error('Spotify ne répond pas pour le moment.')

function Probe() {
  const current = useSpotify()
  useLayoutEffect(() => { controller = current })
  return showCard ? React.createElement(SpotifySongAction, { song: { id: 'song', title: 'Unstoppable', artist: '', link: '', status: 'pending' }, controller: current, refresh: async () => { refreshes++ } }) : null
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
  replies = []; requests.length = 0; payloads.length = 0
  showCard = false; refreshes = 0
  globalThis.__spotifyAction = async (action, payload) => {
    requests.push(action); payloads.push(payload)
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
test('ambiguous search displays choices without claiming success or refreshing guest data', async () => {
  await mount(status())
  const choices = [{ id: 'a'.repeat(22), title: 'Song', artists: 'Artist', album: '', duration_ms: 200000, url: 'https://open.spotify.com/track/' + 'a'.repeat(22) }]
  replies.push({ action: 'queue', value: { ok: false, needs_choice: true, song_id: 'song', choices } })
  await act(async () => assert.equal(await controller.run('queue', { song_id: 'song' }), false))
  assert.deepEqual(controller.choices.song, choices)
  assert.equal(controller.notice, '')
  assert.equal(controller.error, '')
  replies.push({ action: 'queue', value: { ok: true, title: 'Song' } }, status())
  await act(async () => assert.equal(await controller.run('queue', { song_id: 'song', track_id: choices[0].id }), true))
  assert.match(controller.notice, /Song.*a rejoint la file/)
})
test('admin no longer has a search form or candidate selector for an unresolved title', async () => {
  showCard = true
  await mount(status())
  assert.equal(document.querySelector('input'), null)
  assert.equal(document.querySelector('form'), null)
  assert.match(document.body.textContent, /À préciser par l’invité/)
  assert.deepEqual(requests, ['status'])
})

const guestTrack = { id: 'a'.repeat(22), title: 'Diamonds', artists: 'Rihanna', album: 'Unapologetic', duration_ms: 225000, url: 'https://open.spotify.com/track/' + 'a'.repeat(22) }
const guestProps = { identity: { playerKey: 'guest:test', sessionToken: 'private-session' }, song: { id: 'legacy-song', title: 'diamond', artist: '' }, onSent: async () => { refreshes++ } }
const clickSearch = async () => act(async () => document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })))
const sendButton = () => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Ajouter à la file Spotify'))
test('guest chooses the artist and sends directly, without any admin request', async () => {
  await act(async () => root.render(React.createElement(GuestSongPicker, guestProps)))
  replies.push({ action: 'guest_search', value: { ok: true, choices: [{ ...guestTrack, id: 'b'.repeat(22), artists: 'Another artist' }, guestTrack] } })
  await clickSearch()
  assert.equal(refreshes, 0); assert.equal(sendButton().disabled, true)
  await act(async () => document.querySelectorAll('input[type="radio"]')[1].click())
  assert.equal(sendButton().disabled, false)
  replies.push({ action: 'guest_send', value: { ok: true, title: 'Diamonds' } })
  await act(async () => sendButton().click())
  assert.equal(refreshes, 1)
  assert.equal(payloads[1].track_id, guestTrack.id)
  assert.equal(payloads[1].song_id, 'legacy-song')
  assert.deepEqual(requests, ['guest_search', 'guest_send'])
})
test('no match asks only the guest to refine, with no send or quota refresh', async () => {
  await act(async () => root.render(React.createElement(GuestSongPicker, guestProps)))
  replies.push({ action: 'guest_search', value: { ok: true, choices: [] } })
  await clickSearch()
  assert.match(document.body.textContent, /Précise le titre/)
  assert.equal(sendButton(), undefined); assert.equal(refreshes, 0)
  assert.deepEqual(requests, ['guest_search'])
})
test('retry uses the same proposal ID after a failed guest send', async () => {
  await act(async () => root.render(React.createElement(GuestSongPicker, guestProps)))
  replies.push({ action: 'guest_search', value: { ok: true, choices: [guestTrack] } })
  await clickSearch()
  await act(async () => document.querySelector('input[type="radio"]').click())
  replies.push({ action: 'guest_send', value: new Error('Connexion interrompue') })
  await act(async () => sendButton().click())
  assert.equal(refreshes, 0); assert.match(document.body.textContent, /Connexion interrompue/)
  replies.push({ action: 'guest_send', value: { ok: true, title: 'Diamonds' } })
  await act(async () => sendButton().click())
  assert.equal(payloads[1].song_id, payloads[2].song_id)
  assert.equal(refreshes, 1)
})
test('new search clears the previous selected candidate', async () => {
  await act(async () => root.render(React.createElement(GuestSongPicker, guestProps)))
  replies.push({ action: 'guest_search', value: { ok: true, choices: [guestTrack] } })
  await clickSearch()
  await act(async () => document.querySelector('input[type="radio"]').click())
  replies.push({ action: 'guest_search', value: { ok: true, choices: [guestTrack] } })
  await clickSearch()
  assert.equal(document.querySelector('input[type="radio"]').checked, false)
  assert.equal(sendButton().disabled, true)
})
