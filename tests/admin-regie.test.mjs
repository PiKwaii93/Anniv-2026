// Real dock and commands, with in-memory providers: never writes to the party.
import assert from 'node:assert/strict'
import test, { after, afterEach, beforeEach } from 'node:test'
import { mkdir, mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { JSDOM } from 'jsdom'
import { build } from 'vite'

const mocks = {
  '/lib/supabase': 'export const supabase = new Proxy({}, { get(_, key) { return globalThis.__regie.db[key] } })',
  '/auth/AuthContext': 'export const useAuth = () => globalThis.__regie.auth',
  'PartyContext': 'export const useParty = () => globalThis.__regie.party; export const isPartyModuleVisible = () => true',
  'AnnouncementContext': 'export const useAnnouncement = () => globalThis.__regie.announcement',
}
const bundle = await build({ configFile: false, logLevel: 'error', plugins: [{
  name: 'regie-fixtures', enforce: 'pre',
  resolveId(id) {
    const key = Object.keys(mocks).find(key => id.endsWith(key))
    if (key) return '\0fixture:' + key
  },
  load(id) { if (id.startsWith('\0fixture:')) return mocks[id.slice(9)] },
}], build: { ssr: resolve('src/features/party/AdminPartyDock.tsx'), write: false, minify: false } })
await mkdir(resolve('node_modules/.cache'), { recursive: true })
const cache = await mkdtemp(resolve('node_modules/.cache/admin-regie-'))
for (const output of bundle.output) {
  if (output.type !== 'chunk') continue
  const path = join(cache, output.fileName)
  await mkdir(resolve(path, '..'), { recursive: true })
  await writeFile(path, output.code)
}
const { default: Dock } = await import(pathToFileURL(join(cache, bundle.output.find(item => item.isEntry).fileName)).href)
after(() => rm(cache, { recursive: true }))

let dom, root, fixture, writes
const query = selector => document.querySelector(selector)
const click = async selector => {
  assert.ok(query(selector), selector)
  await act(async () => query(selector).click())
}
async function render(path = '/admin/live') {
  await act(async () => root.render(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(Dock))))
}
async function openTools() {
  await click('.admin-regie__launcher')
  // React.lazy loads the real command components asynchronously.
  for (let attempt = 0; attempt < 50 && !query('.director-scenes-launch'); attempt++) {
    await act(async () => new Promise(resolve => setTimeout(resolve, 10)))
  }
}
beforeEach(() => {
  dom = new JSDOM('<div id="root"></div><button id="outside">Page</button>', { url: 'https://party.test/admin/live' })
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.Node = dom.window.Node
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  root = createRoot(query('#root')); writes = []
  const channel = { on() { return this }, subscribe() { return this } }
  fixture = globalThis.__regie = {
    auth: { isAdmin: true },
    party: { settings: { phase: 'preparation', featuredModule: null }, loading: false, saving: false, error: '', refresh: async () => {}, updateSettings: async value => writes.push(value) },
    announcement: { announcement: { message: 'Test' }, visible: false, saving: false, error: '', refresh: async () => {}, publish: async value => { writes.push(value); return true }, clear: async () => writes.push('clear') },
    db: { from: () => ({ select: () => ({ eq: async () => ({ count: 2, error: null }) }) }), channel: () => channel, removeChannel: async () => {}, rpc: async (...args) => { writes.push(args); return { data: { ok: true } } } },
  }
})
afterEach(async () => {
  await act(async () => root.unmount())
  dom.window.close()
  delete globalThis.window; delete globalThis.document; delete globalThis.Node
  delete globalThis.IS_REACT_ACT_ENVIRONMENT; delete globalThis.__regie
})

test('one launcher replaces the pile, and every command belongs to its tools panel', async () => {
  await render()
  assert.equal(query('#root').querySelectorAll('button').length, 1)
  await openTools()
  for (const selector of ['.director-scenes-dock', '.director-announcement-dock', '.photo-director-dock', '.party-dock', '.party-director-launch--content']) {
    assert.ok(query('#admin-regie-tools').querySelector(selector), selector)
  }
  assert.equal(query('a[href="/screen"]').target, '_blank')
  assert.equal(query('a[href="/admin/photos"]').textContent.includes('2 photos à valider'), true)
  assert.deepEqual(writes, [])
})
test('scenes and announcements expand in normal DOM order, one at a time', async () => {
  await render(); await openTools(); await click('.director-scenes-launch')
  assert.ok(query('#regie-scenes-panel'))
  assert.equal(query('.director-scenes-dock').firstElementChild, query('.director-scenes-launch'))
  await click('.director-announcement-launch')
  assert.equal(query('#regie-scenes-panel'), null)
  assert.ok(query('#regie-announcement-panel'))
  assert.equal(query('.director-announcement-dock').firstElementChild, query('.director-announcement-launch'))
  await click('[aria-label="Fermer le panneau d’annonces"]')
  assert.equal(query('#regie-announcement-panel'), null)
  assert.deepEqual(writes, [])
})
test('Escape closes the tools and restores focus to Régie', async () => {
  await render(); await openTools(); await click('.director-announcement-launch')
  await act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  assert.equal(query('#admin-regie-tools'), null)
  assert.equal(document.activeElement, query('.admin-regie__launcher'))
  await openTools()
  assert.equal(query('#regie-announcement-panel'), null)
})
test('an outside pointer closes the menu without stealing focus', async () => {
  await render(); await openTools()
  query('#outside').focus()
  await act(async () => query('#outside').dispatchEvent(new window.Event('pointerdown', { bubbles: true })))
  assert.equal(query('#admin-regie-tools'), null)
  assert.equal(document.activeElement, query('#outside'))
})
test('navigation to content closes the tools and retains the admin launcher', async () => {
  await render(); await openTools(); await click('a[href="/admin/content"]')
  assert.equal(query('#admin-regie-tools'), null)
  assert.ok(query('.admin-regie__launcher'))
  await click('.admin-regie__launcher')
  assert.equal(query('.director-scenes-dock'), null)
})
test('Mode soirée opens its existing settings separately, without changing data', async () => {
  await render(); await openTools(); await click('.party-dock')
  assert.ok(query('[role="dialog"]'))
  assert.equal(query('#admin-regie-tools'), null)
  assert.ok(query('.admin-regie').hasAttribute('inert'))
  assert.deepEqual(writes, [])
})
test('announcement actions still publish and remove only when explicitly clicked', async () => {
  fixture.announcement.visible = true
  await render(); await openTools(); await click('.director-announcement-launch')
  assert.deepEqual(writes, [])
  await click('.director-announcement-quick button')
  assert.deepEqual(writes[0], { message: '🍕 Les pizzas sont arrivées !', kind: 'food', durationSeconds: 15 })
  await click('.director-announcement-current button')
  assert.equal(writes[1], 'clear')
})
test('closing scene retains its confirmation and only submits after acceptance', async () => {
  await render(); await openTools(); await click('.director-scenes-launch')
  window.confirm = () => false
  await click('.director-scene:last-child'); assert.deepEqual(writes, [])
  window.confirm = () => true
  await click('.director-scene:last-child')
  assert.deepEqual(writes, [['admin_apply_party_scene', { p_scene: 'closing' }]])
})
for (const path of ['/admin/login', '/', '/screen']) test(`no admin controls on ${path}`, async () => {
  await render(path); assert.equal(query('.admin-regie'), null)
})
test('non-admins never receive the dock', async () => {
  fixture.auth.isAdmin = false; await render(); assert.equal(query('.admin-regie'), null)
})
test('layout has one positioning owner, bounded scrolling and no legacy page-level docks', async () => {
  const css = await readFile('src/features/party/AdminRegie.css', 'utf8')
  assert.equal((css.match(/position: fixed/g) ?? []).length, 1)
  assert.match(css, /max-height: calc\(100dvh/)
  assert.match(css, /overflow-y: auto/)
  assert.match(css, /\.admin-regie :is\(\.party-dock[\s\S]*?position: static/)
  assert.match(css, /\.director-scenes-panel, \.director-announcement-panel\)[\s\S]*?position: static/)
  const page = await readFile('src/pages/DirectorModePolished.tsx', 'utf8')
  assert.doesNotMatch(page, /DirectorScenesDock|DirectorAnnouncementDock|PhotoHuntDirectorDock|director-tv-launch/)
})
