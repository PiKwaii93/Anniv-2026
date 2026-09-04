import assert from 'node:assert/strict'
import test, { beforeEach, afterEach, after } from 'node:test'
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import React, { act, useEffect } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { JSDOM } from 'jsdom'
import { build } from 'vite'
const boot = new JSDOM('<div/>')
globalThis.window = boot.window; globalThis.document = boot.window.document
const { createRoot } = await import('react-dom/client')
boot.window.close(); delete globalThis.window; delete globalThis.document
const bundle = await build({ configFile: false, logLevel: 'error', plugins: [{
  name: 'reset-test', enforce: 'pre',
  resolveId(id) {
    if (id.endsWith('virtual:reset')) return '\0reset'
    if (id.endsWith('/lib/supabase')) return '\0db'
    if (id.endsWith('/auth/AuthContext')) return '\0auth'
  },
  load(id) {
    if (id === '\0auth') return 'export const useAuth=()=>globalThis.__reset.auth'
    if (id === '\0db') return `export const supabase={rpc:(...args)=>{const p=globalThis.__reset.rpc(...args);p.abortSignal=()=>p;return p},storage:{from:bucket=>({remove:paths=>globalThis.__reset.remove(bucket,paths)})}}`
    if (id === '\0reset') return `export * from ${JSON.stringify(resolve('src/features/identity/partyDataReset.ts'))};export {default as Admin} from ${JSON.stringify(resolve('src/features/identity/AdminPartyDataReset.tsx'))};export {default as Boundary} from ${JSON.stringify(resolve('src/features/identity/PartyDataBoundary.tsx'))};`
  },
}], build: { ssr: 'virtual:reset', write: false, minify: false } })
await mkdir(resolve('node_modules/.cache'), { recursive: true })
const cache = await mkdtemp(resolve('node_modules/.cache/data-reset-'))
for (const out of bundle.output) if (out.type === 'chunk') await writeFile(join(cache, out.fileName), out.code)
const ui = await import(pathToFileURL(join(cache, bundle.output.find(o => o.isEntry).fileName)).href)
after(() => rm(cache, { recursive: true }))
let dom, root, f, calls, timers, mounts
const empty = { id: null, pending: 0, paths: [] }
const button = text => [...document.querySelectorAll('button')].find(b => b.textContent.includes(text))
const click = async b => { assert.ok(b); await act(async () => b.click()) }
async function type(value) {
  const input = document.querySelector('#party-reset-word')
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value)
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
}
async function render(boundary = false, path = '/admin/guests') {
  function Child() { useEffect(() => { mounts++ }, []); return React.createElement('p', null, 'Guest content') }
  await act(async () => root.render(React.createElement(MemoryRouter, { initialEntries: [path] }, boundary ? React.createElement(ui.Boundary, null, React.createElement(Child)) : React.createElement(ui.Admin))))
}
beforeEach(() => {
  dom = new JSDOM('<div id="root"></div>', { url: 'https://reset.test/', pretendToBeVisual: true })
  globalThis.window = dom.window; globalThis.document = dom.window.document
  globalThis.localStorage = dom.window.localStorage
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  timers = []; window.setInterval = (fn, ms) => { timers.push({ fn, ms }); return timers.length }; window.clearInterval = () => {}
  root = createRoot(document.querySelector('#root')); calls = []; mounts = 0
  f = globalThis.__reset = { auth: { isAdmin: true }, epoch: 0, latest: empty, resetError: null, storageError: null,
    rpc: async (name, args) => {
      calls.push({ name, args })
      if (name === 'party_data_epoch') return { data: f.epoch, error: f.epochError }
      if (name === 'admin_party_reset_status') return { data: f.latest, error: null }
      if (name === 'admin_reset_party_data') return { data: { id: args.p_request, epoch: 1, pending: f.photo ? 1 : 0, paths: f.photo ? ['guest/photo.jpg'] : [] }, error: f.resetError }
      if (name === 'admin_ack_party_reset_photos') return { data: { id: args.p_request, epoch: 1, pending: 0, paths: [] }, error: null }
      throw new Error(name)
    },
    remove: async (bucket, paths) => { calls.push({ bucket, paths }); return { error: f.storageError } },
  }
})
afterEach(async () => { await act(async () => root.unmount()); dom.window.close(); delete globalThis.window; delete globalThis.document; delete globalThis.localStorage; delete globalThis.__reset })
const mutations = () => calls.filter(c => c.name === 'admin_reset_party_data')
test('non-admin cannot see reset or even read cleanup targets', async () => { f.auth.isAdmin = false; await render(); assert.equal(document.querySelector('button'), null); assert.equal(calls.length, 0) })
test('opening and cancelling do not delete anything', async () => { await render(); await click(button('Effacer les données')); assert.equal(button('Effacer définitivement').disabled, true); await click(button('Annuler')); assert.equal(mutations().length, 0); assert.equal(calls.filter(c => c.bucket).length, 0) })
test('exact EFFACER confirmation is required', async () => {
  await render(); await click(button('Effacer les données')); await type('effacer'); assert.equal(button('Effacer définitivement').disabled, true)
  await type('EFFACER'); assert.equal(button('Effacer définitivement').disabled, false); await click(button('Effacer définitivement'))
  assert.equal(mutations().length, 1); assert.equal(mutations()[0].args.p_confirmation, 'EFFACER'); assert.match(document.body.textContent, /Remise à zéro terminée/)
})
test('double click sends only one destructive request', async () => {
  let finish; const base = f.rpc
  f.rpc = (name, args) => name === 'admin_reset_party_data' ? (calls.push({ name, args }), new Promise(r => finish = () => r({ data: { ...empty, id: args.p_request } }))) : base(name, args)
  await render(); await click(button('Effacer les données')); await type('EFFACER')
  await act(async () => { button('Effacer définitivement').click(); button('Effacer définitivement').click() })
  assert.equal(mutations().length, 1); await act(async () => finish())
})
test('unknown result retries the same UUID, not a fresh destructive action', async () => {
  f.resetError = { message: 'Failed to fetch' }; await render(); await click(button('Effacer les données')); await type('EFFACER'); await click(button('Effacer définitivement'))
  assert.match(document.querySelector('[role=alert]').textContent, /non confirmée/)
  const id = mutations()[0].args.p_request; assert.equal(localStorage.getItem(ui.RESET_REQUEST_KEY), id)
  f.resetError = null; await click(button('Effacer définitivement')); assert.equal(mutations()[1].args.p_request, id)
})
test('live party refusal never touches Storage', async () => {
  f.resetError = { message: 'PREPARATION_REQUIRED' }; await render(); await click(button('Effacer les données')); await type('EFFACER'); await click(button('Effacer définitivement'))
  assert.match(document.querySelector('[role=alert]').textContent, /Préparation/); assert.equal(calls.filter(c => c.bucket).length, 0)
})
test('photo removal uses exact queued paths in dedicated bucket', async () => {
  f.photo = true; await render(); await click(button('Effacer les données')); await type('EFFACER'); await click(button('Effacer définitivement'))
  assert.deepEqual(calls.filter(c => c.bucket), [{ bucket: 'photo-hunt', paths: ['guest/photo.jpg'] }])
  assert.equal(calls.filter(c => c.name === 'admin_ack_party_reset_photos').length, 1)
})
test('Storage failure is resumable without resetting database twice', async () => {
  f.photo = true; f.storageError = { message: 'Offline' }; await render(); await click(button('Effacer les données')); await type('EFFACER'); await click(button('Effacer définitivement'))
  assert.match(document.querySelector('[role=alert]').textContent, /nettoyage.*pas terminé/)
  assert.ok(button('Reprendre le nettoyage')); assert.equal(calls.filter(c => c.name === 'admin_ack_party_reset_photos').length, 0)
  f.storageError = null; f.latest = { id: mutations()[0].args.p_request, pending: 1, paths: ['guest/photo.jpg'] }
  await click(button('Reprendre le nettoyage')); assert.equal(mutations().length, 1); assert.match(document.body.textContent, /Aucune nouvelle remise à zéro/)
})
test('reload finds incomplete cleanup, without automatic removal', async () => {
  f.latest = { id: 'previous', pending: 1, paths: ['old.jpg'] }; await render()
  assert.ok(button('Reprendre le nettoyage')); assert.equal(mutations().length, 0); assert.equal(calls.filter(c => c.bucket).length, 0)
})
test('a committed request recovered after a lost response never erases new data', async () => {
  localStorage.setItem(ui.RESET_REQUEST_KEY, 'previous'); f.latest = { id: 'previous', pending: 0, paths: [] }
  await render(); await click(button('Effacer les données')); await type('EFFACER'); await click(button('Effacer définitivement'))
  assert.equal(mutations().length, 0); assert.match(document.body.textContent, /Aucune nouvelle remise à zéro/)
})
test('unchanged Storage acknowledgement stops rather than looping forever', async () => {
  const r = { id: 'same', pending: 1, paths: ['old.jpg'] }
  f.rpc = async () => ({ data: r }); await assert.rejects(ui.cleanResetPhotos(r, () => {}), /STALLED/)
})
test('epoch clear is scoped; admin auth and unrelated storage survive', () => {
  for (const key of ['anniv-2026-bingo-v1','anniv-2026-party-identity-v1','anniv-2026-secret-mission-identity-v1','anniv-2026-live-vote-identity-v1','anniv-2026-capsule-draft-v1:guest:a','anniv-2026-mission-resume:guest:a']) localStorage.setItem(key, 'old')
  localStorage.setItem('sb-project-auth-token', 'admin'); localStorage.setItem(ui.RESET_REQUEST_KEY, 'pending'); localStorage.setItem('other-app', 'keep'); window.sessionStorage.setItem('anniv2026:credits-done', 'old')
  assert.equal(ui.acceptDataEpoch(1, localStorage, window.sessionStorage), true)
  assert.deepEqual(Object.keys(localStorage).sort(), [ui.DATA_EPOCH_KEY, ui.RESET_REQUEST_KEY, 'other-app', 'sb-project-auth-token'].sort())
  assert.equal(window.sessionStorage.getItem('anniv2026:credits-done'), null)
})
test('initial zero epoch and repeated epoch do not wipe ongoing game', () => {
  localStorage.setItem('anniv-2026-bingo-v1', 'game'); assert.equal(ui.acceptDataEpoch(0, localStorage, window.sessionStorage), false)
  assert.equal(ui.acceptDataEpoch(0, localStorage, window.sessionStorage), false); assert.equal(localStorage.getItem('anniv-2026-bingo-v1'), 'game')
})
test('old open tab clears its stale writes even if another tab accepted epoch', () => {
  localStorage.setItem(ui.DATA_EPOCH_KEY, '2'); localStorage.setItem('anniv-2026-bingo-v1', 'stale')
  assert.equal(ui.acceptDataEpoch(2, localStorage, window.sessionStorage, 1), true); assert.equal(localStorage.getItem('anniv-2026-bingo-v1'), null)
})
test('guest providers wait for epoch, then remount after reset', async () => {
  await render(true, '/bingo'); assert.equal(mounts, 1)
  f.epoch = 1; await act(async () => timers[0].fn()); assert.equal(mounts, 2)
  await act(async () => timers[0].fn()); assert.equal(mounts, 2)
})
test('offline startup does not mount providers with stale game data', async () => {
  f.epochError = { message: 'Offline' }; await render(true, '/bingo'); assert.equal(mounts, 0); assert.ok(button('Réessayer'))
  f.epochError = null; await click(button('Réessayer')); assert.equal(mounts, 1)
})
test('admin cleanup remains mounted through epoch change', async () => {
  await render(true); assert.equal(mounts, 1); f.epoch = 2; await act(async () => timers[0].fn()); assert.equal(mounts, 1)
})
test('migration never deletes catalogs, guests, auth, or SQL Storage metadata', async () => {
  const sql = await readFile('supabase/migrations/20260904094459_admin_party_data_reset.sql', 'utf8')
  assert.ok(!/delete from (?:public\.(?:guests|plus_ones|app_admins|bingo_prompts)|storage\.|auth\.)/i.test(sql))
  assert.ok(!/truncate|set\s+safeupdate\.enabled|where\s+true/i.test(sql.replace(/--[^\n]*/g, '')))
  assert.match(sql, /CONFIRMATION_REQUIRED/); assert.match(sql, /PREPARATION_REQUIRED/); assert.match(sql, /SPOTIFY_BUSY/)
  assert.match(sql, /exists\(select 1 from party_reset.requests where id=p_request\)/)
  const rollback = await readFile('tests/party-data-reset.sql', 'utf8'); assert.match(rollback, /rollback;\s*$/)
})
