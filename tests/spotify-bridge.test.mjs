import test from 'node:test'
import assert from 'node:assert/strict'
import { createHandler, spotifyTrackUri, challenge, REDIRECT_URI } from '../supabase/functions/spotify-jukebox/service.ts'
const trackId = '4iV5W9uYEdYUVa79Axb7Rh'
const songId = '11111111-1111-4111-8111-111111111111'
function harness(overrides = {}) {
  const ops = [], network = [], diagnostics = []
  const config = { client_id: 'a'.repeat(32), device_id: 'pc', device_name: 'PC test', tokens: { access_token: 'PRIVATE_ACCESS', refresh_token: 'PRIVATE_REFRESH', expires_at: Date.now() + 3600000 }, dispatches: {} }
  const handler = createHandler({
    report: (event) => diagnostics.push(event),
    authenticate: async (jwt) => jwt === 'test-admin' ? 'admin-id' : null,
    rpc: async (_admin, op, payload) => {
      ops.push({ op, payload })
      if (op === 'acquire') return { ...config, ...overrides.config }
      if (op === 'song') return overrides.song ?? { link: `https://open.spotify.com/track/${trackId}` }
      if (op === 'consume') { if (payload.state !== 'valid') throw new Error('OAUTH_EXPIRED'); return { verifier: 'PRIVATE_VERIFIER', client_id: config.client_id } }
      return {}
    },
    fetcher: async (url, options) => {
      network.push({ url, options })
      if (overrides.fetcher) { const response = await overrides.fetcher(url, options); if (response) return response }
      if (url.endsWith('/devices')) return Response.json({ devices: [{ id: 'pc', name: 'PC', is_restricted: false }] })
      if (url.endsWith('/me/player')) return Response.json({ device: { id: overrides.active ?? 'pc' }, is_playing: true, item: { name: 'Track', artists: [] } })
      if (url.includes('/search?')) return Response.json({ tracks: { items: overrides.tracks ?? [] } })
      if (url.includes('/tracks/')) return Response.json({ name: 'Track', is_playable: true })
      return new Response(null, { status: 204 })
    },
  })
  const call = async (action, payload = {}, jwt = 'test-admin') => {
    const response = await handler(new Request('https://example.test/functions/v1/spotify-jukebox', { method: 'POST', headers: { Authorization: `Bearer ${jwt}` }, body: JSON.stringify({ action, ...payload }) }))
    return { status: response.status, body: await response.json() }
  }
  return { call, ops, network, diagnostics }
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
for (const action of ['play', 'pause', 'next']) {
  for (const status of [200, 202, 204]) {
    test(`${action} accepts HTTP ${status} with no response body without repeating the command`, async () => {
      const h = harness({ fetcher: async (url) => url.includes(`/me/player/${action}?`) ? new Response(null, { status }) : null })
      const result = await h.call(action)
      assert.equal(result.status, 200)
      assert.deepEqual(result.body, { ok: true })
      assert.equal(h.network.filter(({ url }) => url.includes(`/me/player/${action}?`)).length, 1)
      assert.deepEqual(h.diagnostics, [{ event: 'spotify_bridge', action, stage: 'playback_command', code: 'SPOTIFY_ACCEPTED', status }])
    })
  }
}
test('an empty playback response keeps devices available without raising a warning', async () => {
  const h = harness({ fetcher: async (url) => url.endsWith('/me/player') ? new Response('', { status: 200 }) : null })
  const result = await h.call('status')
  assert.equal(result.status, 200)
  assert.equal(result.body.warning, undefined)
  assert.equal(result.body.devices[0].id, 'pc')
  assert.equal(result.body.playback, null)
})
test('playback controls still report explicit Spotify rejection', async () => {
  const h = harness({ fetcher: async (url) => url.includes('/me/player/pause?') ? new Response(null, { status: 403 }) : null })
  assert.equal((await h.call('pause')).body.error, 'SPOTIFY_FORBIDDEN')
})
test('invalid Spotify JSON has a distinct error and diagnostics contain no secrets', async () => {
  const h = harness({ fetcher: async (url) => url.endsWith('/me/player/devices') ? new Response('PRIVATE_INVALID_BODY', { status: 200 }) : null })
  assert.equal((await h.call('status')).body.warning, 'SPOTIFY_INVALID_RESPONSE')
  assert.deepEqual(h.diagnostics, [{ event: 'spotify_bridge', action: 'status', stage: 'status', code: 'SPOTIFY_INVALID_RESPONSE' }])
  assert.ok(!JSON.stringify(h.diagnostics).includes('PRIVATE'))
})

const candidate = (id = trackId, title = 'Blinding Lights', artist = 'The Weeknd') => ({ id, name: title, artists: [{ name: artist }], album: { name: 'After Hours' }, duration_ms: 200000 })
test('title-only proposal searches Spotify and queues a unique exact match', async () => {
  const h = harness({ song: { title: 'Blinding Lights', artist: '', link: '' }, tracks: [candidate()] })
  assert.equal((await h.call('queue', { song_id: songId })).status, 200)
  const search = new URL(h.network.find(({ url }) => url.includes('/search?')).url)
  assert.equal(search.searchParams.get('q'), 'blinding lights')
  assert.equal(search.searchParams.get('type'), 'track')
  assert.equal(search.searchParams.get('limit'), '10')
  assert.equal(h.network.filter(({ url }) => url.includes('/queue?')).length, 1)
  assert.ok(h.ops.some(({ op }) => op === 'sent'))
})
test('ambiguous titles return choices without claiming or sending the song', async () => {
  const h = harness({ song: { title: 'Unstoppable', artist: '', link: '' }, tracks: [candidate(trackId, 'Unstoppable', 'The Score'), candidate('a'.repeat(22), 'Unstoppable', 'Sia')] })
  const result = await h.call('queue', { song_id: songId })
  assert.equal(result.body.needs_choice, true)
  assert.equal(result.body.choices.length, 2)
  assert.ok(!h.ops.some(({ op }) => ['claim_song', 'sent'].includes(op)))
  assert.ok(!h.network.some(({ url }) => url.includes('/queue?')))
  assert.ok(!JSON.stringify(result.body).includes('PRIVATE'))
})
test('an explicit candidate selection queues without searching again', async () => {
  const h = harness({ song: { title: 'Unstoppable', artist: '', link: '' } })
  assert.equal((await h.call('queue', { song_id: songId, track_id: trackId })).status, 200)
  assert.ok(!h.network.some(({ url }) => url.includes('/search?')))
  assert.ok(h.network.some(({ url }) => url.includes('/queue?')))
})
test('no result keeps the proposal pending and allows an in-app corrected search', async () => {
  const h = harness({ song: { title: 'Typo', artist: '', link: '' } })
  assert.deepEqual((await h.call('queue', { song_id: songId })).body.choices, [])
  assert.ok(!h.ops.some(({ op }) => op === 'claim_song'))
  const result = await h.call('search', { song_id: songId, search_title: 'Correct title', search_artist: 'Artist' })
  assert.equal(result.body.needs_choice, true)
  assert.equal(new URL(h.network.at(-1).url).searchParams.get('q'), 'correct title artist')
  assert.ok(!h.network.some(({ url }) => url.includes('/queue?')))
})
test('search does not require an active playback device and never sends music', async () => {
  const h = harness({ config: { device_id: null }, song: { title: 'Blinding Lights', artist: '', link: '' }, tracks: [candidate()] })
  assert.equal((await h.call('search', { song_id: songId })).body.choices.length, 1)
  assert.ok(!h.network.some(({ url }) => url.includes('/devices') || url.includes('/queue?')))
})
test('Spotify search rejection is visible and never falls back to an arbitrary track', async () => {
  const h = harness({ song: { title: 'Blinding Lights', artist: '', link: '' }, fetcher: async (url) => url.includes('/search?') ? new Response(null, { status: 429 }) : null })
  assert.equal((await h.call('queue', { song_id: songId })).body.error, 'SPOTIFY_RATE_LIMIT')
  assert.ok(!h.ops.some(({ op }) => op === 'claim_song'))
})
test('invalid selections and already dispatched requests do not reach search or queue', async () => {
  const bad = harness()
  assert.equal((await bad.call('queue', { song_id: songId, track_id: 'not-an-id' })).body.error, 'INVALID_INPUT')
  const sent = harness({ config: { dispatches: { [songId]: { state: 'sent' } } }, song: { title: 'Anything', artist: '', link: '' } })
  assert.equal((await sent.call('queue', { song_id: songId })).body.error, 'ALREADY_DISPATCHED')
  assert.ok(!sent.network.some(({ url }) => url.includes('/search?') || url.includes('/queue?')))
})
