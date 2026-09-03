// Real ending screen, announcement overlay and slide builder; in-memory data and
// a deterministic browser clock. No account, announcement or production write.
import assert from 'node:assert/strict'
import test, { after, afterEach, beforeEach } from 'node:test'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { JSDOM } from 'jsdom'
import { build } from 'vite'

const cache = resolve('node_modules/.cache/party-ending-test.mjs')
const mocks = {
  '/lib/supabase': 'export const supabase = new Proxy({}, { get() { throw new Error("Ending tests must never contact the database") } })',
  './AnnouncementContext': 'export const useAnnouncement = () => globalThis.__ending.announcement',
  '/announcements/AnnouncementContext': 'export const useAnnouncement = () => globalThis.__ending.announcement',
  '/party/PartyContext': 'export const useParty = () => globalThis.__ending.party',
  '/party-extras/usePartyExtras': 'export const usePartyExtras = () => globalThis.__ending.extras',
  '/hallOfFame/useHallOfFame': 'export const useHallOfFame = () => globalThis.__ending.hall',
  '/photo-hunt/PhotoHuntImage': 'export default function Photo() { return null }',
  './HallOfFameScreen': 'import React from "react"; export default function Hall() { return React.createElement("main", {"data-testid": "hall"}, "Hall of Fame") }',
}
const bundle = await build({ configFile: false, logLevel: 'error', plugins: [{
  name: 'ending-fixtures', enforce: 'pre',
  resolveId(id) {
    if (id.endsWith('virtual:ending')) return '\0ending'
    const key = Object.keys(mocks).find(key => id.endsWith(key))
    if (key) return '\0fixture:' + key
  },
  load(id) {
    if (id === '\0ending') return `export {default as Ending} from ${JSON.stringify(resolve('src/pages/PartyEndingScreen.tsx'))}; export {default as Overlay} from ${JSON.stringify(resolve('src/features/announcements/LiveAnnouncementOverlay.tsx'))};`
    if (id.startsWith('\0fixture:')) return mocks[id.slice(9)]
  },
}], build: { ssr: 'virtual:ending', write: false, minify: false } })
await mkdir(resolve('node_modules/.cache'), { recursive: true })
await writeFile(cache, bundle.output.find(item => item.type === 'chunk').code)
const { Ending, Overlay } = await import(pathToFileURL(cache).href)
after(() => rm(cache))

let dom, root, fixture, now, nextTimer, timers, reducedMotion, refreshes
const storageKey = 'anniv2026:credits-done'
const heading = () => document.querySelector('.credits-slide h1')?.textContent
const button = label => [...document.querySelectorAll('.credits-screen button')].find(node => node.textContent === label)
async function render() {
  await act(async () => root.render(React.createElement(MemoryRouter, { initialEntries: ['/screen'] }, React.createElement(React.Fragment, null, React.createElement(Overlay), React.createElement(Ending)))))
}
async function advance(ms) {
  const end = now + ms
  for (;;) {
    const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at).find(([, value]) => value.at <= end)
    if (!next) break
    const [id, value] = next
    now = value.at; timers.delete(id)
    await act(async () => value.callback())
  }
  now = end
}
async function announce(visible) {
  fixture.announcement.visible = visible
  await render()
}
beforeEach(() => {
  dom = new JSDOM('<div id="root"></div>', { url: 'https://party.test/screen' })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.sessionStorage = dom.window.sessionStorage
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  reducedMotion = false; refreshes = 0; now = 0; nextTimer = 0; timers = new Map()
  window.matchMedia = () => ({ matches: reducedMotion })
  window.setTimeout = (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, at: now + delay }); return id }
  window.clearTimeout = id => timers.delete(id)
  root = createRoot(document.getElementById('root'))
  fixture = globalThis.__ending = {
    announcement: { visible: false, loading: false, announcement: { kind: 'info', eventId: 'closing', message: 'Merci à tous !' }, refresh: async () => { refreshes++ } },
    party: { settings: { photosVisible: true, guestsVisible: true, missionsVisible: true, roomVisible: true, beerPongVisible: true } },
    extras: { data: { settings: { credits_enabled: true }, ending_key: 'ending-1', credits_names: ['Alex', 'Léa'] }, error: '' },
    hall: { hall: { beerPong: {}, photos: null, missions: { ranking: [] }, room: { ranking: [] } }, loading: false, error: '' },
  }
})
afterEach(async () => {
  await act(async () => root.unmount())
  assert.equal(timers.size, 0, 'Unmount must cancel the slide timer')
  dom.window.close()
  delete globalThis.window; delete globalThis.document; delete globalThis.sessionStorage
  delete globalThis.IS_REACT_ACT_ENVIRONMENT; delete globalThis.__ending
})

test('closing announcement cannot consume or complete the credits behind its overlay', async () => {
  fixture.announcement.visible = true
  await render()
  assert.equal(refreshes, 1)
  assert.ok(document.querySelector('.live-announcement--screen'))
  assert.ok(document.querySelector('.credits-screen').hasAttribute('inert'))
  assert.equal(document.querySelector('.credits-screen').getAttribute('aria-hidden'), 'true')
  assert.ok([...document.querySelectorAll('.credits-screen button')].every(node => node.disabled))
  await advance(60000)
  assert.equal(heading(), 'C’était nous.')
  assert.equal(sessionStorage.getItem(storageKey), null)
  assert.equal(timers.size, 0)
  await announce(false)
  assert.equal(document.querySelector('.live-announcement--screen'), null)
  assert.equal(document.querySelector('.credits-screen').hasAttribute('inert'), false)
  await advance(9999); assert.equal(heading(), 'C’était nous.')
  await advance(1); assert.equal(heading(), 'Au générique')
  await advance(10000); assert.equal(heading(), 'Merci d’avoir été là.')
  await advance(10000); assert.ok(document.querySelector('[data-testid="hall"]'))
  assert.equal(sessionStorage.getItem(storageKey), 'ending-1')
})
test('an announcement during playback holds the current slide and resumes with a full interval', async () => {
  await render(); await advance(19000)
  assert.equal(heading(), 'Au générique')
  await announce(true); await advance(60000)
  assert.equal(heading(), 'Au générique')
  await announce(false); await advance(9999)
  assert.equal(heading(), 'Au générique')
  await advance(1); assert.equal(heading(), 'Merci d’avoir été là.')
})
test('the final slide cannot mark the ending complete while covered', async () => {
  await render(); await advance(20000); await announce(true); await advance(60000)
  assert.equal(heading(), 'Merci d’avoir été là.')
  assert.equal(sessionStorage.getItem(storageKey), null)
  await announce(false); await advance(10000)
  assert.equal(sessionStorage.getItem(storageKey), 'ending-1')
})
test('initial announcement loading suspends the first timer', async () => {
  fixture.announcement.loading = true
  await render(); await advance(60000)
  assert.equal(heading(), 'C’était nous.')
  fixture.announcement.loading = false
  await render(); await advance(10000)
  assert.equal(heading(), 'Au générique')
})
test('loading credits cannot be skipped with a hidden control behind an announcement', async () => {
  fixture.announcement.visible = true; fixture.hall.loading = true
  await render()
  assert.equal(button('Passer au palmarès').disabled, true)
  await act(async () => button('Passer au palmarès').click())
  assert.equal(sessionStorage.getItem(storageKey), null)
  fixture.hall.loading = false
  await render(); await advance(60000)
  assert.equal(heading(), 'C’était nous.')
  await announce(false); await advance(10000)
  assert.equal(heading(), 'Au générique')
})
test('party state arriving before the closing announcement waits for a fresh read', async () => {
  let resolveRefresh
  fixture.announcement.refresh = () => new Promise(resolve => { resolveRefresh = resolve })
  await render(); await advance(60000)
  assert.equal(heading(), 'C’était nous.')
  fixture.announcement.visible = true
  await act(async () => resolveRefresh())
  await render(); await advance(60000)
  assert.equal(heading(), 'C’était nous.')
  await announce(false); await advance(10000)
  assert.equal(heading(), 'Au générique')
})
test('automatic suspension preserves manual pause and manual resume still works', async () => {
  await render(); await act(async () => button('Ⅱ Pause').click())
  await announce(true); await advance(60000); await announce(false); await advance(60000)
  assert.equal(heading(), 'C’était nous.')
  assert.equal(button('▶ Reprendre').getAttribute('aria-pressed'), 'true')
  await act(async () => button('▶ Reprendre').click()); await advance(10000)
  assert.equal(heading(), 'Au générique')
})
test('reduced-motion users remain paused after the announcement ends', async () => {
  reducedMotion = true; fixture.announcement.visible = true
  await render(); await announce(false); await advance(60000)
  assert.equal(heading(), 'C’était nous.')
  assert.ok(button('▶ Reprendre'))
  await act(async () => button('Suivant →').click())
  assert.equal(heading(), 'Au générique')
})
test('a new ending key relaunches from the intro but still waits for the announcement', async () => {
  await render(); await advance(10000); await announce(true)
  fixture.extras.data = { ...fixture.extras.data, ending_key: 'ending-2' }
  await render(); await advance(60000)
  assert.equal(refreshes, 2)
  assert.equal(heading(), 'C’était nous.')
  await announce(false); await advance(30000)
  assert.equal(sessionStorage.getItem(storageKey), 'ending-2')
})
test('an obsolete refresh cannot release a newer ending before its own refresh resolves', async () => {
  const pending = []
  fixture.announcement.refresh = () => new Promise(resolve => pending.push(resolve))
  await render()
  fixture.extras.data = { ...fixture.extras.data, ending_key: 'ending-2' }
  await render(); await act(async () => pending[0]()); await advance(60000)
  assert.equal(heading(), 'C’était nous.')
  await act(async () => pending[1]()); await advance(10000)
  assert.equal(heading(), 'Au générique')
})
test('completed credits are not replayed by a later announcement or refresh', async () => {
  sessionStorage.setItem(storageKey, 'ending-1')
  await render(); await announce(true); await announce(false); await advance(60000)
  assert.ok(document.querySelector('[data-testid="hall"]'))
  assert.equal(heading(), undefined)
})
test('disabled credits still show the Hall of Fame directly', async () => {
  fixture.extras.data.settings.credits_enabled = false
  await render(); await advance(60000)
  assert.ok(document.querySelector('[data-testid="hall"]'))
  assert.equal(sessionStorage.getItem(storageKey), null)
})
test('next and skip-to-palmares commands remain available once the overlay is gone', async () => {
  await render(); await act(async () => button('Suivant →').click())
  assert.equal(heading(), 'Au générique')
  await act(async () => button('Voir le palmarès ↗').click())
  assert.ok(document.querySelector('[data-testid="hall"]'))
  assert.equal(sessionStorage.getItem(storageKey), 'ending-1')
})
