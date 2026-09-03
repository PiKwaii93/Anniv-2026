import { rankTrackChoices, normalizeMusicText } from './catalog.ts'

type Json = Record<string, any>
export type GuestRpc = (identity: Json, op: string, payload: Json, lease: string) => Promise<Json>
const API = 'https://api.spotify.com/v1'
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const codes = ['IDENTITY_REQUIRED', 'JUKEBOX_CLOSED', 'SONG_LIMIT', 'SONG_EXISTS', 'SONG_NOT_READY', 'SPOTIFY_BUSY', 'SEARCH_RATE_LIMIT', 'QUEUE_UNCERTAIN', 'INVALID_INPUT']

// Public gateway JWT + the existing private party session. No admin identity is
// borrowed and no guest can select a device, control playback, or read tokens.
export async function guestRequest(body: Json, rpc: GuestRpc, fetcher: typeof fetch = fetch): Promise<Json> {
  const identity = { player_key: body.player_key, session_token: body.session_token }
  const lease = crypto.randomUUID()
  let acquired = false
  const db = (op: string, payload: Json = {}) => rpc(identity, op, payload, lease)
  const fail = (code: string): never => { throw new Error(code) }
  try {
    if (typeof identity.player_key !== 'string' || identity.player_key.length > 150 || !uuid.test(identity.session_token ?? '')) fail('IDENTITY_REQUIRED')
    if (body.song_id !== undefined && !uuid.test(body.song_id)) fail('INVALID_INPUT')
    if (!['guest_search', 'guest_send'].includes(body.action)) fail('INVALID_INPUT')
    if (body.action === 'guest_send' && (!uuid.test(body.song_id ?? '') || !/^[a-zA-Z0-9]{22}$/.test(body.track_id ?? ''))) fail('INVALID_INPUT')
    const title = body.title ?? '', artist = body.artist ?? ''
    if (body.action === 'guest_search' && (typeof title !== 'string' || typeof artist !== 'string' || !normalizeMusicText(title) || title.length > 100 || artist.length > 100)) fail('INVALID_INPUT')
    const config = await db('acquire', { song_id: body.song_id })
    acquired = true
    if (body.action === 'guest_send' && config.dispatch === 'sent') return { ok: true, song_id: body.song_id, title: config.title, already_sent: true }
    if (config.dispatch === 'uncertain') fail('QUEUE_UNCERTAIN')
    if (!config.tokens) fail('GUEST_SPOTIFY_OFFLINE')
    const request = (url: string, options: RequestInit = {}) => fetcher(url, { ...options, signal: AbortSignal.timeout(10000) })
    const check = (response: Response) => {
      if (!response.ok) fail(response.status === 429 ? 'SPOTIFY_RATE_LIMIT' : response.status === 401 || response.status === 403 ? 'GUEST_SPOTIFY_OFFLINE' : 'GUEST_SPOTIFY_UNAVAILABLE')
    }
    let accessToken = config.tokens.access_token
    if (config.tokens.expires_at < Date.now() + 60000) {
      const response = await request('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: config.tokens.refresh_token, client_id: config.client_id }) })
      check(response)
      const tokens = await response.json()
      if (!tokens.access_token || !Number.isFinite(tokens.expires_in)) fail('GUEST_SPOTIFY_UNAVAILABLE')
      await db('tokens', { access_token: tokens.access_token, refresh_token: tokens.refresh_token ?? config.tokens.refresh_token, expires_at: Date.now() + tokens.expires_in * 1000 })
      accessToken = tokens.access_token
    }
    const get = async (path: string) => {
      const response = await request(`${API}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } })
      check(response)
      if (response.status === 204) return null
      return response.json()
    }
    if (body.action === 'guest_search') {
      const params = new URLSearchParams({ q: normalizeMusicText(`${title} ${artist}`), type: 'track', limit: '10', market: 'FR' })
      const results = await get(`/search?${params}`)
      if (!Array.isArray(results?.tracks?.items)) fail('GUEST_SPOTIFY_UNAVAILABLE')
      return { ok: true, choices: rankTrackChoices(results.tracks.items, title, artist).choices }
    }
    if (!config.device_id) fail('GUEST_SPOTIFY_OFFLINE')
    const [track, playback] = await Promise.all([get(`/tracks/${body.track_id}?market=FR`), get('/me/player')])
    if (playback?.device?.id !== config.device_id || playback.device.is_restricted) fail('GUEST_SPOTIFY_OFFLINE')
    // Canonical metadata comes only from Spotify, never from guest-supplied names.
    const choice = rankTrackChoices(track ? [track] : [], track?.name ?? '', '').choices[0]
    if (!choice) fail('TRACK_UNAVAILABLE')
    const uri = `spotify:track:${choice.id}`
    await db('prepare', { song_id: body.song_id, title: choice.title.slice(0, 100), artist: choice.artists.slice(0, 100), link: choice.url })
    await db('claim_song', { song_id: body.song_id, uri })
    let response: Response
    try { response = await request(`${API}/me/player/queue?uri=${encodeURIComponent(uri)}&device_id=${encodeURIComponent(config.device_id)}`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } }) }
    catch { fail('QUEUE_UNCERTAIN') }
    if (!response!.ok) {
      if (response!.status >= 500) fail('QUEUE_UNCERTAIN')
      await db('failed', { song_id: body.song_id })
      check(response!)
    }
    try { await db('sent', { song_id: body.song_id }) } catch { fail('QUEUE_UNCERTAIN') }
    return { ok: true, song_id: body.song_id, title: choice.title, artists: choice.artists }
  } catch (error) {
    const allowed = [...codes, 'GUEST_SPOTIFY_OFFLINE', 'GUEST_SPOTIFY_UNAVAILABLE', 'SPOTIFY_RATE_LIMIT', 'TRACK_UNAVAILABLE']
    const message = String((error as Error)?.message)
    const code = allowed.find((code) => message === code) ?? 'GUEST_SPOTIFY_UNAVAILABLE'
    // Deliberately omit identities, queries, tokens and upstream payloads.
    return { error: code }
  } finally {
    if (acquired) { try { await db('release') } catch { /* Shared lease expires. */ } }
  }
}
