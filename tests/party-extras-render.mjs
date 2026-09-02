// Render the real pages with in-memory fixtures. No production account or data is touched.
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const cache = resolve('node_modules/.cache/party-extras-render.mjs')
const fixture = {
  settings: { capsule_visible: true, capsule_open: true, capsule_reveal_at: '2026-10-25T11:00:00Z', jukebox_visible: true, jukebox_open: true, duos_visible: true, duos_open: true, credits_enabled: true },
  phase: 'live', capsule: { own: null, count: 0, entries: [], revealed: false }, songs: [], song_count: 0,
  duo: null, duo_attempts: 0, waiting: false, duo_stats: { waiting: 0, completed: 0 }, credits_names: [], ending_key: 'test-ending',
}
globalThis.__partyExtrasRender = { data: structuredClone(fixture), error: '', busy: false, act: async () => { throw new Error('Rendering must never write') } }
const mocks = {
  '/spotify/useSpotify': 'export function useSpotify() { return { data: {client_id:null, connected:false, dispatches:{}, devices:[], redirect_uri: "https://anniv-2026-pi.vercel.app/admin/spotify/callback"}, busy:false, error:"", notice:"", run:async()=>false, refresh:async()=>{} } }',
  '/party-extras/usePartyExtras': 'export function usePartyExtras() { return globalThis.__partyExtrasRender }',
  '/identity/PartyIdentityContext': 'export function usePartyIdentity() { return { identity: { playerKey: "fixture", playerName: "Invité test", sessionToken: "fixture" } } }',
}
const result = await build({ configFile: false, logLevel: 'error', plugins: [react(), { name: 'in-memory-fixtures', enforce: 'pre', resolveId(id) {
  if (id.endsWith('virtual:extras-pages')) return '\0extras-pages'
  const key = Object.keys(mocks).find((key) => id.endsWith(key))
  if (key) return `\0mock:${key}`
}, load(id) {
  if (id === '\0extras-pages') return ['Capsule', 'Jukebox', 'Duos', 'PartyExtrasAdmin'].map((name) => `export {default as ${name}} from ${JSON.stringify(resolve(`src/pages/${name}.tsx`))}`).join('\n')
  if (id.startsWith('\0mock:')) return mocks[id.slice(6)]
} }], build: { ssr: 'virtual:extras-pages', write: false, minify: false } })
const code = result.output.find((item) => item.type === 'chunk').code
await mkdir(resolve('node_modules/.cache'), { recursive: true })
await writeFile(cache, code)
try {
  const pages = await import(pathToFileURL(cache).href)
  const render = (name, patch = {}) => {
    globalThis.__partyExtrasRender.data = { ...structuredClone(fixture), ...patch }
    return renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(pages[name])))
  }
  assert.match(render('Capsule'), /Sceller ma lettre/)
  assert.match(render('Capsule'), /25 octobre 2026 à 12:00/)
  const closed = render('Capsule', { capsule: { ...fixture.capsule, revealed: true } })
  assert.doesNotMatch(closed, /Sceller ma lettre/)
  assert.match(closed, /textarea[^>]*disabled/)
  assert.doesNotMatch(render('Capsule', { settings: { ...fixture.settings, capsule_visible: false } }), /textarea/)
  const quota = render('Jukebox', { song_count: 3 })
  assert.doesNotMatch(quota, /Proposer ce morceau/)
  assert.match(quota, /trois propositions sont envoyées/)
  assert.match(render('Duos', { phase: 'preparation' }), /button disabled=""[^>]*>Je participe/)
  assert.match(render('Duos', { waiting: true }), /Quitter la file/)
  const pair = render('Duos', { duo: { id: 'pair', partner: 'Partenaire', prompt: 'Un défi', status: 'active', confirmed: true, partner_confirmed: false } })
  assert.match(pair, /button disabled=""[^>]*>En attente de ton partenaire/)
  assert.match(pair, /Passer ce défi/)
  const lockedAdmin = render('PartyExtrasAdmin', { capsule: { ...fixture.capsule, count: 2 } })
  assert.match(lockedAdmin, /2 lettres scellées/)
  assert.match(lockedAdmin, /Client ID Spotify/)
  assert.match(lockedAdmin, /Enregistrer le Client ID/)
  assert.doesNotMatch(lockedAdmin, /Exporter les lettres/)
  const openedAdmin = render('PartyExtrasAdmin', { capsule: { own: null, count: 1, revealed: true, entries: [{ player_name: 'Test', message: '<script>alert(1)</script>', memory: '', prediction: '' }] } })
  assert.match(openedAdmin, /Exporter les lettres/)
  assert.ok(openedAdmin.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
  assert.ok(!openedAdmin.includes('<script>'))
  if (process.env.EXTRAS_REVIEW_PATH) {
    const css = await readFile('src/features/party-extras/extras.css', 'utf8')
    const escape = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
    const frames = ['Capsule', 'Jukebox', 'Duos', 'PartyExtrasAdmin'].map((name) => {
      const content = `<!doctype html><html lang="fr"><head><meta charset="UTF-8"><style>body{margin:0;background:#101116;font-family:Arial,sans-serif}${css}</style></head><body>${render(name)}</body></html>`
      return `<section><h2>${name} · 390 px</h2><iframe title="${name}" width="390" height="1050" srcdoc="${escape(content)}"></iframe></section>`
    }).join('')
    await writeFile(process.env.EXTRAS_REVIEW_PATH, `<!doctype html><html lang="fr"><meta charset="UTF-8"><title>Vérification locale · données fictives</title><style>body{font-family:Arial;background:#252525;color:white}main{display:grid;grid-template-columns:repeat(2,410px);gap:30px}iframe{border:1px solid #777}</style><main>${frames}</main></html>`)
  }
  console.log('PASS: guest forms, closed/hidden capsule, song quota, duo opt-in and confirmations, admin reveal and HTML escaping')
} finally {
  delete globalThis.__partyExtrasRender
  await rm(cache)
}
