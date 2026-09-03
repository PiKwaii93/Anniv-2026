// Real TV router, legacy screen and photo wall. Only providers/network are
// replaced by memory fixtures; no production question, vote or photo is changed.
import assert from 'node:assert/strict'
import test, { after, afterEach, beforeEach } from 'node:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import { build } from 'vite'

const mocks = {
  '/lib/supabase': 'export const supabase = new Proxy({}, { get(_, key) { return globalThis.__screenTransition.db[key] } })',
  '/party/PartyContext': 'export const useParty = () => globalThis.__screenTransition.party',
  '/photo-hunt/PhotoHuntImage': 'import React from "react"; export default function Photo({ alt }) { return React.createElement("img", { alt }) }',
  './PartyEndingScreen': 'export default function Ending() { return "Générique" }',
  './PartyScreenAuto': 'export default function Auto() { return "Rotation automatique" }',
}
const bundle = await build({ configFile: false, logLevel: 'error', plugins: [{
  name: 'screen-transition-fixtures', enforce: 'pre',
  resolveId(id) {
    if (id.endsWith('virtual:screen-transition')) return '\0screen-transition'
    const key = Object.keys(mocks).find(key => id.endsWith(key))
    if (key) return '\0fixture:' + key
  },
  load(id) {
    if (id === '\0screen-transition') return `export {default as Router} from ${JSON.stringify(resolve('src/pages/PartyScreenWithHall.tsx'))}; export {default as Screen} from ${JSON.stringify(resolve('src/pages/PartyScreen.tsx'))};`
    if (id.startsWith('\0fixture:')) return mocks[id.slice(9)]
  },
}], build: { ssr: 'virtual:screen-transition', write: false, minify: false } })
await mkdir(resolve('node_modules/.cache'), { recursive: true })
const cache = await mkdtemp(resolve('node_modules/.cache/screen-transition-'))
for (const output of bundle.output) {
  if (output.type !== 'chunk') continue
  const path = join(cache, output.fileName)
  await mkdir(resolve(path, '..'), { recursive: true })
  await writeFile(path, output.code)
}
const { Router, Screen } = await import(pathToFileURL(join(cache, bundle.output.find(item => item.isEntry).fileName)).href)
after(() => rm(cache, { recursive: true }))

const routerChannel = 'anniv-2026-party-screen-router'
const screenChannel = 'anniv-2026-party-screen'
let dom, root, fixture, channels, errors, timers, nextTimer
const content = () => document.getElementById('root').textContent
const isPhotoWall = () => assert.ok(document.querySelector('.photo-hunt-screen'), content())
async function render(component = Router) { await act(async () => root.render(React.createElement(component))) }
async function emit(name) { await act(async () => channels.get(name)?.emit()) }
beforeEach(() => {
  dom = new JSDOM('<div id="root"></div>', { url: 'https://party.test/screen' })
  globalThis.window = dom.window; globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  channels = new Map(); errors = []; timers = new Map(); nextTimer = 0
  window.setInterval = callback => { const id = ++nextTimer; timers.set(id, callback); return id }
  window.clearInterval = id => timers.delete(id)
  root = createRoot(document.getElementById('root'), { onUncaughtError: error => errors.push(error) })
  fixture = globalThis.__screenTransition = {
    party: { loading: false, settings: { phase: 'live', featuredModule: 'photos' } },
    room: { phase: 'open', prompt: 'Question test', mode: 'majority', closesAt: '2099-01-01T00:00:00Z' },
    photos: [{ id: 'photo-1', player_key: 'fixture', player_name: 'Invité test', challenge_id: 'challenge-1', storage_path: 'fixture.jpg' }],
    photoGate: null,
    db: {
      from(table) {
        const rows = {
          live_vote_public_state: { state: structuredClone(fixture.room) },
          beer_pong_state: { state: {} }, secret_mission_scoreboard: [],
          photo_hunt_submissions: fixture.photos,
          photo_hunt_challenges: [{ id: 'challenge-1', prompt: 'Défi photo test' }],
        }
        assert.ok(Object.hasOwn(rows, table), `Unexpected table: ${table}`)
        const result = { data: rows[table], error: null }
        const read = () => table === 'photo_hunt_submissions' && fixture.photoGate
          ? fixture.photoGate.then(() => result) : Promise.resolve(result)
        const query = {
          select() { return query }, eq() { return query }, order() { return query }, limit() { return query },
          maybeSingle: read, then(done, fail) { return read().then(done, fail) },
        }
        return query
      },
      channel(name) {
        const handlers = []
        const channel = {
          on(_event, filter, callback) { handlers.push({ filter, callback }); return channel },
          subscribe(callback) { callback?.('SUBSCRIBED'); return channel },
          emit() { for (const handler of handlers) if (handler.filter.table === 'live_vote_public_state') handler.callback() },
        }
        channels.set(name, channel)
        return channel
      },
      removeChannel(channel) { for (const [name, value] of channels) if (value === channel) channels.delete(name) },
    },
  }
})
afterEach(async () => {
  await act(async () => root.unmount())
  assert.deepEqual(errors, [])
  assert.equal(channels.size, 0, 'All subscriptions must be removed')
  assert.equal(timers.size, 0, 'All intervals must be cancelled')
  dom.window.close()
  delete globalThis.window; delete globalThis.document
  delete globalThis.IS_REACT_ACT_ENVIRONMENT; delete globalThis.__screenTransition
})

for (const first of [screenChannel, routerChannel]) {
  for (const photoCount of [0, 1]) {
    test(`skip ${first === screenChannel ? 'child-first' : 'router-first'} with ${photoCount} photos never unmounts the React root`, async () => {
      if (!photoCount) fixture.photos = []
      await render()
      assert.match(content(), /Question test/)
      fixture.room = { phase: 'idle' }
      await emit(first)
      isPhotoWall()
      await emit(first === screenChannel ? routerChannel : screenChannel)
      isPhotoWall()
      assert.match(content(), photoCount ? /Invité test/ : /remplir le mur/)
    })
  }
}
test('normal reveal and active-room priority remain unchanged, then clearing shows Photos', async () => {
  await render()
  assert.match(content(), /vote ouvert/)
  assert.equal(document.querySelector('.photo-hunt-screen'), null)
  fixture.room = { phase: 'revealed', prompt: 'Question test', result: { rows: [], totalVotes: 0 } }
  await emit(screenChannel); await emit(routerChannel)
  assert.match(content(), /résultats/)
  fixture.room = { phase: 'idle' }
  await emit(screenChannel); await emit(routerChannel)
  isPhotoWall()
})
test('slow photo reads show the loading screen instead of a blank root after skip', async () => {
  await render()
  let release
  fixture.photoGate = new Promise(resolve => { release = resolve })
  fixture.room = { phase: 'idle' }
  await emit(screenChannel)
  assert.match(content(), /Connexion au mur photo/)
  await act(async () => release())
  isPhotoWall()
  assert.match(content(), /Invité test/)
})
for (const [module, expected] of [['bingo', 'Bingo'], ['missions', 'Missions secrètes'], ['beer-pong', 'Beer Pong'], ['room', 'La Salle']]) {
  test(`skip still returns to the selected ${module} module`, async () => {
    fixture.party.settings.featuredModule = module
    await render()
    fixture.room = { phase: 'idle' }
    await emit(screenChannel); await emit(routerChannel)
    assert.match(content(), new RegExp(expected))
  })
}
test('skip without a featured module resumes automatic rotation', async () => {
  fixture.party.settings.featuredModule = null
  await render()
  fixture.room = { phase: 'idle' }
  await emit(screenChannel)
  assert.match(content(), /Rejoins/)
  await emit(routerChannel)
  assert.match(content(), /Rotation automatique/)
})
test('an unsupported module falls back to the welcome screen, never a property-access crash', async () => {
  fixture.party.settings.featuredModule = 'future-module'
  fixture.room = { phase: 'idle' }
  await render(Screen)
  assert.match(content(), /Rejoins/)
})
