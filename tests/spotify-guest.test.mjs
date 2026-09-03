import test from 'node:test'
import assert from 'node:assert/strict'
import { createHandler } from '../supabase/functions/spotify-jukebox/service.ts'

const song = '11111111-1111-4111-8111-111111111111'
const token = '22222222-2222-4222-8222-222222222222'
const track = { id: 'A'.repeat(22), name: 'Diamonds', artists: [{ name: 'Rihanna' }], album: { name: 'Unapologetic' }, duration_ms: 225000, is_playable: true }
function harness(options = {}) {
  const ops = [], network = []
  const config = { client_id: 'c'.repeat(32), device_id: 'pc', tokens: { access_token: 'SECRET_ACCESS', refresh_token: 'SECRET_REFRESH', expires_at: Date.now() + 3600000 }, ...options.config }
  const handler = createHandler({
    authenticate: async () => null,
    rpc: async () => { throw new Error('Guest must never enter admin RPC') },
    guestRpc: async (identity, op, payload) => {
      ops.push({ op, payload })
      if (identity.session_token !== token) throw new Error('IDENTITY_REQUIRED')
      if (op === 'acquire') { if (options.denied) throw new Error(options.denied); return config }
      return {}
    },
    fetcher: async (url, init) => {
      network.push({ url, init })
      if (options.fetcher) { const response = await options.fetcher(url, init); if (response) return response }
      if (url.includes('/search?')) return Response.json({ tracks: { items: options.items ?? [track] } })
      if (url.includes('/tracks/')) return Response.json(options.track ?? track)
      if (url.endsWith('/me/player')) return Response.json({ device: { id: options.active ?? 'pc', is_restricted: false } })
      if (url.includes('/api/token')) return Response.json({ access_token: 'NEW_SECRET', expires_in: 3600 })
      return new Response(null, { status: 204 })
    },
    report: () => {},
  })
  const call = async (action = 'guest_search', patch = {}) => {
    const response = await handler(new Request('https://example.test', { method: 'POST', headers: { Authorization: 'Bearer gateway-anon' }, body: JSON.stringify({ action, player_key: 'guest:test', session_token: token, song_id: song, title: 'diamond', artist: '', track_id: track.id, ...patch }) }))
    return { status: response.status, body: await response.json() }
  }
  return { call, ops, network }
}
test('guest search returns choices to guest, with no submission or playback command', async () => {
  const h = harness(); const result = await h.call()
  assert.equal(result.status, 200); assert.equal(result.body.choices[0].artists, 'Rihanna')
  assert.deepEqual(h.ops.map(x => x.op), ['acquire', 'release'])
  assert.ok(!JSON.stringify(result).includes('SECRET'))
  assert.equal(h.network.length, 1)
  assert.equal(new URL(h.network[0].url).searchParams.get('q'), 'diamond')
})
test('no matches remain on guest side and do not consume a proposal', async () => {
  const h = harness({ items: [] }); assert.deepEqual((await h.call()).body.choices, [])
  assert.ok(!h.ops.some(x => x.op === 'prepare'))
})
for (const denied of ['IDENTITY_REQUIRED', 'SEARCH_RATE_LIMIT', 'JUKEBOX_CLOSED', 'SONG_LIMIT', 'SONG_NOT_READY']) {
  test(`${denied} is enforced before Spotify access`, async () => {
    const h = harness({ denied }); assert.equal((await h.call()).body.error, denied); assert.equal(h.network.length, 0)
  })
}
test('guest selected track goes directly to configured PC without admin acceptance', async () => {
  const h = harness(); const result = await h.call('guest_send', { title: 'FORGED', artist: 'FORGED', device_id: 'phone' })
  assert.equal(result.body.ok, true)
  assert.deepEqual(h.ops.map(x => x.op), ['acquire', 'prepare', 'claim_song', 'sent', 'release'])
  assert.equal(h.ops.find(x => x.op === 'prepare').payload.artist, 'Rihanna')
  const sends = h.network.filter(x => x.url.includes('/queue?'))
  assert.equal(sends.length, 1); assert.ok(sends[0].url.endsWith('device_id=pc'))
  assert.ok(!h.network.some(x => x.url.includes('/search?')))
})
test('guest send is idempotent after successful acknowledgement is lost', async () => {
  const h = harness({ config: { dispatch: 'sent', title: 'Diamonds' } })
  assert.equal((await h.call('guest_send')).body.already_sent, true); assert.equal(h.network.length, 0)
})
test('uncertain send is not retried or presented as success', async () => {
  const h = harness({ fetcher: async url => { if (url.includes('/queue?')) throw new Error('timeout SECRET') } })
  assert.equal((await h.call('guest_send')).body.error, 'QUEUE_UNCERTAIN')
  assert.equal(h.network.filter(x => x.url.includes('/queue?')).length, 1)
  assert.ok(!h.ops.some(x => ['failed', 'sent'].includes(x.op)))
  const retry = harness({ config: { dispatch: 'uncertain' } })
  assert.equal((await retry.call('guest_send')).body.error, 'QUEUE_UNCERTAIN'); assert.equal(retry.network.length, 0)
})
test('offline PC and unavailable tracks never create a guest submission', async () => {
  for (const options of [{ active: 'phone' }, { track: { ...track, is_playable: false } }]) {
    const h = harness(options); assert.ok((await h.call('guest_send')).body.error)
    assert.ok(!h.ops.some(x => x.op === 'prepare'))
  }
})
test('explicit Spotify refusal releases the claim but preserves retry identity', async () => {
  const h = harness({ fetcher: async url => url.includes('/queue?') ? new Response(null, { status: 429 }) : null })
  assert.equal((await h.call('guest_send')).body.error, 'SPOTIFY_RATE_LIMIT')
  assert.ok(h.ops.some(x => x.op === 'failed')); assert.ok(!h.ops.some(x => x.op === 'sent'))
})
test('refresh preserves host refresh token without exposing it', async () => {
  const h = harness({ config: { tokens: { access_token: 'old', refresh_token: 'SECRET_REFRESH', expires_at: 0 } } })
  const result = await h.call(); assert.equal(result.body.ok, true)
  assert.equal(h.ops.find(x => x.op === 'tokens').payload.refresh_token, 'SECRET_REFRESH')
  assert.ok(!JSON.stringify(result.body).includes('SECRET'))
})
test('invalid IDs and unsupported actions cannot reach guest privileges', async () => {
  const h = harness(); assert.equal((await h.call('guest_send', { track_id: '../other' })).body.error, 'INVALID_INPUT')
  assert.equal(h.ops.length, 0)
  assert.equal((await h.call('play')).status, 401); assert.equal(h.network.length, 0)
})
