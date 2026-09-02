import test from 'node:test'
import assert from 'node:assert/strict'
import { createHandler, spotifyTrackUri, challenge, REDIRECT_URI } from '../supabase/functions/spotify-jukebox/service.ts'
const trackId = '4iV5W9uYEdYUVa79Axb7Rh'
const songId = '11111111-1111-4111-8111-111111111111'
function harness(overrides = {}) {
  const ops = [], network = []
  const config = { client_id: 'a'.repeat(32), device_id: 'pc', device_name: 'PC test', tokens: { access_token: 'PRIVATE_ACCESS', refresh_token: 'PRIVATE_REFRESH', expires_at: Date.now() + 3600000 }, dispatches: {} }
  const handler = createHandler({
    authenticate: async (jwt) => jwt === 'test-admin' ? 'admin-id' : null,
    rpc: async (_admin, op, payload) => {
      ops.push({ op, payload })
      if (op === 'acquire') return { ...config, ...overrides.config }
      if (op === 'song') return { link: `https://open.spotify.com/track/${trackId}` }
      if (op === 'consume') { if (payload.state !== 'valid') throw new Error('OAUTH_EXPIRED'); return { verifier: 'PRIVATE_VERIFIER', client_id: config.client_id } }
      return {}
    },
    fetcher: async (url, options) => {
      network.push({ url, options })
      if (overrides.fetcher) { const response = await overrides.fetcher(url, options); if (response) return response }
      if (url.endsWith('/devices')) return Response.json({ devices: [{ id: 'pc', name: 'PC', is_restricted: false }] })
      if (url.endsWith('/me/player')) return Response.json({ device: { id: overrides.active ?? 'pc' }, is_playing: true, item: { name: 'Track', artists: [] } })
      if (url.includes('/tracks/')) return Response.json({ name: 'Track', is_playable: true })
      return new Response(null, { status: 204 })
    },
  })
  const call = async (action, payload = {}, jwt = 'test-admin') => {
    const response = await handler(new Request('https://example.test/functions/v1/spotify-jukebox', { method: 'POST', headers: { Authorization: `Bearer ${jwt}` }, body: JSON.stringify({ action, ...payload }) }))
    return { status: response.status, body: await response.json() }
  }
  return { call, ops, network }
}
test('track URLs accept Spotify tracks, reject spoofed hosts, playlists and credentials', () => {
  assert.equal(spotifyTrackUri(`https://open.spotify.com/intl-fr/track/${trackId}?si=abc`), `spotify:track:${trackId}`)
  for (const link of [`https://open.spotify.com.evil/track/${trackId}`, `https://a:b@open.spotify.com/track/${trackId}`, `https://open.spotify.com/playlist/${trackId}`, 'javascript:alert(1)']) assert.equal(spotifyTrackUri(link), null)
})
test('PKCE SHA256 follows the RFC7636 test vector', async () => {
  assert.equal(await challenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
})
test('unauthenticated callers never reach the database or Spotify', async () => {
  const h = harness(); assert.equal((await h.call('status', {}, 'fake')).status, 401)
  assert.equal(h.ops.length, 0); assert.equal(h.network.length, 0)
})
test('status returns only public fields; revoked tokens still permit reconnect UI', async () => {
  const h = harness(); assert.ok(!JSON.stringify((await h.call('status')).body).includes('PRIVATE'))
  const revoked = harness({ config: { tokens: { refresh_token: 'secret', expires_at: 0 } }, fetcher: async () => new Response('{}', { status: 400 }) })
  const result = await revoked.call('status')
  assert.equal(result.status, 200); assert.equal(result.body.connected, true); assert.equal(result.body.warning, 'SPOTIFY_RECONNECT')
  assert.ok(!JSON.stringify(result.body).includes('secret'))
})
test('authorization uses a fixed callback, state and PKCE without returning verifier', async () => {
  const h = harness(); const result = await h.call('connect', { redirect_uri: 'https://evil.test' })
  const url = new URL(result.body.url)
  assert.equal(url.searchParams.get('redirect_uri'), REDIRECT_URI)
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(url.searchParams.get('state').length, 64)
  assert.ok(!JSON.stringify(result.body).includes(h.ops.find((op) => op.op === 'begin').payload.verifier))
})
test('bad callback state is rejected before token exchange', async () => {
  const h = harness(); assert.equal((await h.call('callback', { code: 'code', state: 'wrong' })).body.error, 'OAUTH_EXPIRED')
  assert.equal(h.network.length, 0)
})
test('refresh keeps the refresh token when Spotify omits a replacement', async () => {
  const h = harness({ config: { tokens: { access_token: 'old', refresh_token: 'keep-me', expires_at: 0 } }, fetcher: async (url) => url.includes('/api/token') ? Response.json({ access_token: 'new', expires_in: 3600 }) : null })
  await h.call('status'); assert.equal(h.ops.find((op) => op.op === 'tokens').payload.refresh_token, 'keep-me')
})
test('queue targets the selected PC and records acceptance only after success', async () => {
  const h = harness(); assert.equal((await h.call('queue', { song_id: songId })).status, 200)
  assert.ok(h.network.find((item) => item.url.includes('/queue?')).url.endsWith('device_id=pc'))
  assert.deepEqual(h.ops.map((op) => op.op), ['acquire', 'song', 'claim_song', 'sent', 'release'])
})
test('queue never falls back to the phone when the PC is not active', async () => {
  const h = harness({ active: 'phone' }); assert.equal((await h.call('queue', { song_id: songId })).body.error, 'START_ON_PC')
  assert.ok(!h.network.some((item) => item.url.includes('/queue?')))
})
test('uncertain network failure leaves a claim and never retries the queue request', async () => {
  const h = harness({ fetcher: async (url) => { if (url.includes('/queue?')) throw new Error('timeout') } })
  assert.equal((await h.call('queue', { song_id: songId })).body.error, 'QUEUE_UNCERTAIN')
  assert.equal(h.network.filter((item) => item.url.includes('/queue?')).length, 1)
  assert.ok(h.ops.some((op) => op.op === 'claim_song')); assert.ok(!h.ops.some((op) => ['sent', 'failed'].includes(op.op)))
})
test('explicit rejection permits a later retry and preserves the proposal', async () => {
  const h = harness({ fetcher: async (url) => url.includes('/queue?') ? new Response('{}', { status: 403 }) : null })
  assert.equal((await h.call('queue', { song_id: songId })).body.error, 'SPOTIFY_FORBIDDEN')
  assert.ok(h.ops.some((op) => op.op === 'failed')); assert.ok(!h.ops.some((op) => op.op === 'sent'))
})
