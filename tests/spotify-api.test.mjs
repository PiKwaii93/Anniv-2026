import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { build } from 'vite'
import { createHandler } from '../supabase/functions/spotify-jukebox/service.ts'

// Exercise the actual browser adapter, Supabase SDK and Edge handler together.
// Only authentication, database storage and the remote Spotify server are fixtures.
const cache = resolve('node_modules/.cache/spotify-api-test.mjs')
const bundle = await build({ configFile: false, logLevel: 'error', plugins: [{
  name: 'spotify-sdk-fixture', enforce: 'pre',
  resolveId(id) { if (id === '../../lib/supabase') return '\0spotify-sdk-fixture' },
  load(id) { if (id === '\0spotify-sdk-fixture') return 'export const supabase = { functions: { invoke: (...args) => globalThis.__spotifyInvoke(...args) } }' },
}], build: { ssr: resolve('src/features/spotify/api.ts'), write: false, minify: false } })
await mkdir(resolve('node_modules/.cache'), { recursive: true })
await writeFile(cache, bundle.output.find((item) => item.type === 'chunk').code)
const { spotifyAction } = await import(pathToFileURL(cache).href)
after(async () => { delete globalThis.__spotifyInvoke; await rm(cache) })

function transport(customFetch) {
  const client = createClient('https://bridge.test', 'test-key', {
    global: { fetch: customFetch, headers: { Authorization: 'Bearer test-admin' } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  globalThis.__spotifyInvoke = (...args) => client.functions.invoke(...args)
}

for (const action of ['play', 'pause', 'next']) {
  test(`${action}: empty Spotify success reaches the browser as a successful command`, async () => {
    let commands = 0
    const handler = createHandler({
      authenticate: async () => 'test-admin', report: () => {},
      rpc: async (_admin, op) => op === 'acquire' ? { device_id: 'pc', tokens: { access_token: 'PRIVATE_TOKEN', expires_at: Date.now() + 3600000 } } : {},
      fetcher: async (url) => {
        if (url.endsWith('/devices')) return Response.json({ devices: [{ id: 'pc' }] })
        assert.ok(url.includes(`/me/player/${action}?device_id=pc`))
        commands++
        return new Response(null, { status: 200 })
      },
    })
    transport((url, options) => handler(new Request(url, options)))
    assert.deepEqual(await spotifyAction(action), { ok: true })
    assert.equal(commands, 1)
  })
}

test('malformed bridge JSON identifies the command and does not blame Spotify availability', async (t) => {
  const logs = []; t.mock.method(console, 'warn', (...args) => logs.push(args))
  transport(async () => new Response('PRIVATE_INVALID_BODY', { headers: { 'Content-Type': 'application/json' } }))
  await assert.rejects(spotifyAction('pause'), /Pause : La réponse du serveur de la régie est illisible/)
  assert.equal(logs[0][1].code, 'BRIDGE_RESPONSE')
  assert.ok(!JSON.stringify(logs).includes('PRIVATE'))
})

test('network failure has a distinct message without logging sensitive SDK context', async (t) => {
  const logs = []; t.mock.method(console, 'warn', (...args) => logs.push(args))
  transport(async () => { throw new Error('PRIVATE_NETWORK_DETAILS') })
  await assert.rejects(spotifyAction('play'), /Lecture : La régie n’a pas reçu de confirmation/)
  assert.equal(logs[0][1].code, 'BRIDGE_NETWORK')
  assert.ok(!JSON.stringify(logs).includes('PRIVATE'))
})

test('an uncertain queue response retains its explicit verification instruction', async (t) => {
  t.mock.method(console, 'warn', () => {})
  transport(async () => Response.json({ error: 'QUEUE_UNCERTAIN' }, { status: 400 }))
  await assert.rejects(spotifyAction('queue'), /Envoi du morceau : Spotify n’a pas confirmé l’envoi. Vérifie sa file/)
})
