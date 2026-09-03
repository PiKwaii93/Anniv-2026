import { normalizeMusicText, rankTrackChoices } from './catalog.ts'
import { guestRequest, type GuestRpc } from './guest.ts'

export const REDIRECT_URI = 'https://anniv-2026-pi.vercel.app/admin/spotify/callback'
const SCOPES = 'user-read-playback-state user-modify-playback-state'
const API = 'https://api.spotify.com/v1'
const TOKEN_URL = 'https://accounts.spotify.com/api/token'

export class BridgeError extends Error {
  code: string
  status: number
  constructor(code: string, status = 400) { super(code); this.code = code; this.status = status }
}
export function spotifyTrackUri(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.hostname !== 'open.spotify.com' || url.username || url.password || url.port) return null
    const id = url.pathname.match(/^\/(?:intl-[a-z]{2}\/)?track\/([a-zA-Z0-9]{22})\/?$/)?.[1]
    return id ? `spotify:track:${id}` : null
  } catch { return null }
}
export function spotifyHttpError(status: number) {
  return new BridgeError(status === 401 ? 'SPOTIFY_RECONNECT' : status === 403 ? 'SPOTIFY_FORBIDDEN' : status === 404 ? 'DEVICE_OFFLINE' : status === 429 ? 'SPOTIFY_RATE_LIMIT' : 'SPOTIFY_UNAVAILABLE', status === 429 ? 429 : 400)
}
const random = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) => n.toString(16).padStart(2, '0')).join('')
export async function challenge(verifier: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  return btoa(String.fromCharCode(...digest)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

// Boundary types represent trusted database and Spotify JSON, never forwarded wholesale to clients.
type Json = Record<string, any>
type Dependencies = { authenticate: (jwt: string) => Promise<string | null>; rpc: (admin: string, op: string, payload: Json, lease: string) => Promise<Json>; guestRpc?: GuestRpc; fetcher?: typeof fetch; report?: (event: Json) => void }
export function createHandler({ authenticate, rpc, guestRpc, fetcher = fetch, report = (event) => console.warn(JSON.stringify(event)) }: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store', 'Content-Type': 'application/json' }
    const respond = (data: Json, status = 200) => new Response(JSON.stringify(data), { status, headers })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return respond({ error: 'METHOD_NOT_ALLOWED' }, 405)
    let admin: string | null = null
    const lease = crypto.randomUUID()
    let acquired = false
    let action = 'unknown'
    // Only fixed action names and error codes are logged, never tokens, bodies or URLs.
    const diagnostic = (code: string, stage: string, status?: number) => report({ event: 'spotify_bridge', action, stage, code, ...(status === undefined ? {} : { status }) })
    try {
      const jwt = request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1]
      if (!jwt) throw new BridgeError('NOT_ADMIN', 401)
      const raw = await request.text()
      if (raw.length > 12000) throw new BridgeError('INVALID_INPUT')
      let body: Json
      try { body = JSON.parse(raw) } catch { throw new BridgeError('INVALID_INPUT') }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BridgeError('INVALID_INPUT')
      if (guestRpc && ['guest_search', 'guest_send'].includes(body.action)) {
        const result = await guestRequest(body, guestRpc, fetcher)
        return respond(result, result.error ? 400 : 200)
      }
      if (!(admin = await authenticate(jwt))) throw new BridgeError('NOT_ADMIN', 401)
      if (['configure', 'disconnect', 'connect', 'callback', 'status', 'device', 'resolve', 'play', 'pause', 'next', 'queue', 'search'].includes(body.action)) action = body.action
      const db = (op: string, payload: Json = {}) => rpc(admin!, op, payload, lease)
      const config = await db('acquire')
      acquired = true
      const fetchSpotify = async (url: string, options: RequestInit = {}) => fetcher(url, { ...options, signal: AbortSignal.timeout(10000) })
      const tokenRequest = async (params: Record<string, string>) => {
        const response = await fetchSpotify(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) })
        if (!response.ok) throw response.status === 429 ? spotifyHttpError(429) : new BridgeError('SPOTIFY_RECONNECT')
        const tokens = await response.json()
        if (!tokens.access_token || !Number.isFinite(tokens.expires_in)) throw new BridgeError('SPOTIFY_UNAVAILABLE')
        return tokens
      }
      const publicConfig = { client_id: config.client_id, connected: !!config.tokens, device_id: config.device_id, device_name: config.device_name, redirect_uri: REDIRECT_URI, dispatches: config.dispatches }
      if (body.action === 'configure') { await db('configure', { client_id: body.client_id }); return respond({ ok: true }) }
      if (body.action === 'disconnect') { await db('disconnect'); return respond({ ok: true }) }
      if (body.action === 'connect') {
        if (!config.client_id) throw new BridgeError('INVALID_CLIENT')
        const state = random(), verifier = random()
        await db('begin', { state, verifier })
        const params = new URLSearchParams({ client_id: config.client_id, response_type: 'code', redirect_uri: REDIRECT_URI, scope: SCOPES, state, code_challenge_method: 'S256', code_challenge: await challenge(verifier), show_dialog: 'true' })
        return respond({ url: `https://accounts.spotify.com/authorize?${params}` })
      }
      if (body.action === 'callback') {
        if (typeof body.code !== 'string' || body.code.length > 4096 || typeof body.state !== 'string') throw new BridgeError('OAUTH_EXPIRED')
        const pending = await db('consume', { state: body.state })
        const tokens = await tokenRequest({ grant_type: 'authorization_code', code: body.code, client_id: pending.client_id, redirect_uri: REDIRECT_URI, code_verifier: pending.verifier })
        if (!tokens.refresh_token || !SCOPES.split(' ').every((scope) => (tokens.scope ?? '').split(' ').includes(scope))) throw new BridgeError('SPOTIFY_RECONNECT')
        await db('tokens', { access_token: tokens.access_token, refresh_token: tokens.refresh_token, expires_at: Date.now() + tokens.expires_in * 1000 })
        await db('device', { id: null, name: null })
        return respond({ ok: true })
      }
      if (body.action === 'status' && !config.tokens) return respond({ ...publicConfig, devices: [], playback: null })
      if (!config.tokens) throw new BridgeError('SPOTIFY_RECONNECT')
      let tokens = config.tokens
      if (tokens.expires_at < Date.now() + 60000) {
        try {
          const fresh = await tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: config.client_id })
          tokens = { access_token: fresh.access_token, refresh_token: fresh.refresh_token ?? tokens.refresh_token, expires_at: Date.now() + fresh.expires_in * 1000 }
          await db('tokens', tokens)
        } catch (error) {
          diagnostic(error instanceof BridgeError ? error.code : 'SPOTIFY_UNAVAILABLE', 'token_refresh')
          if (body.action === 'status') return respond({ ...publicConfig, devices: [], playback: null, warning: error instanceof BridgeError ? error.code : 'SPOTIFY_UNAVAILABLE' })
          throw error
        }
      }
      const spotify = async (path: string, method = 'GET', payload?: Json) => {
        const response = await fetchSpotify(`${API}${path}`, { method, headers: { Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json' }, ...(payload ? { body: JSON.stringify(payload) } : {}) })
        if (!response.ok) throw spotifyHttpError(response.status)
        // Playback commands acknowledge success without a JSON document. Reading one
        // can report an error after Spotify has already applied the command.
        if (method !== 'GET') {
          diagnostic('SPOTIFY_ACCEPTED', 'playback_command', response.status)
          return null
        }
        if (response.status === 204) return null
        const text = await response.text()
        if (!text.trim()) return null
        try { return JSON.parse(text) } catch { throw new BridgeError('SPOTIFY_INVALID_RESPONSE') }
      }
      const devices = async () => ((await spotify('/me/player/devices'))?.devices ?? []).filter((d: Json) => d.id && !d.is_restricted)
      const searchSong = async (song: Json) => {
        const title = body.search_title ?? song.title
        const artist = body.search_artist ?? song.artist ?? ''
        if (typeof title !== 'string' || typeof artist !== 'string' || !title.trim() || title.length > 100 || artist.length > 100) throw new BridgeError('INVALID_INPUT')
        const query = normalizeMusicText(`${title} ${artist}`)
        if (!query) throw new BridgeError('INVALID_INPUT')
        const params = new URLSearchParams({ q: query, type: 'track', limit: '10', market: 'FR' })
        const result = await spotify(`/search?${params}`)
        if (!Array.isArray(result?.tracks?.items)) throw new BridgeError('SPOTIFY_INVALID_RESPONSE')
        return rankTrackChoices(result.tracks.items, title, artist)
      }
      if (body.action === 'status') {
        try {
          const [list, playback] = await Promise.all([devices(), spotify('/me/player')])
          return respond({ ...publicConfig, devices: list.map((d: Json) => ({ id: d.id, name: d.name, type: d.type, is_active: d.is_active })), playback: playback ? { is_playing: playback.is_playing, device_id: playback.device?.id, device_name: playback.device?.name, title: playback.item?.name ?? '', artists: (playback.item?.artists ?? []).map((a: Json) => a.name).join(', '), url: playback.item?.external_urls?.spotify ?? null } : null })
        } catch (error) {
          diagnostic(error instanceof BridgeError ? error.code : 'SPOTIFY_UNAVAILABLE', 'status')
          return respond({ ...publicConfig, devices: [], playback: null, warning: error instanceof BridgeError ? error.code : 'SPOTIFY_UNAVAILABLE' })
        }
      }
      if (body.action === 'device') {
        const device = (await devices()).find((d: Json) => d.id === body.device_id)
        if (!device) throw new BridgeError('DEVICE_OFFLINE')
        await db('device', { id: device.id, name: device.name })
        return respond({ ok: true })
      }
      if (body.action === 'resolve') { await db('resolve', { song_id: body.song_id, resolution: body.resolution }); return respond({ ok: true }) }
      if (body.action === 'search') {
        if (typeof body.song_id !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.song_id)) throw new BridgeError('INVALID_INPUT')
        const song = await db('song', { song_id: body.song_id })
        const result = await searchSong(song)
        return respond({ ok: false, needs_choice: true, song_id: body.song_id, choices: result.choices })
      }
      if (!config.device_id) throw new BridgeError('SELECT_DEVICE')
      if (!(await devices()).some((d: Json) => d.id === config.device_id)) throw new BridgeError('DEVICE_OFFLINE')
      const target = `device_id=${encodeURIComponent(config.device_id)}`
      if (body.action === 'play') { await spotify(`/me/player/play?${target}`, 'PUT'); return respond({ ok: true }) }
      if (body.action === 'pause') { await spotify(`/me/player/pause?${target}`, 'PUT'); return respond({ ok: true }) }
      if (body.action === 'next') {
        // Never repeat a next command after a timeout: it may already have taken effect.
        try { await spotify(`/me/player/next?${target}`, 'POST') } catch (error) { if (!(error instanceof BridgeError)) throw new BridgeError('COMMAND_UNCERTAIN'); throw error }
        return respond({ ok: true })
      }
      if (body.action === 'queue') {
        if (typeof body.song_id !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.song_id)) throw new BridgeError('INVALID_INPUT')
        const song = await db('song', { song_id: body.song_id })
        if (config.dispatches?.[body.song_id]) throw new BridgeError('ALREADY_DISPATCHED')
        let uri: string | null = null
        if (body.track_id !== undefined) {
          if (typeof body.track_id !== 'string' || !/^[a-zA-Z0-9]{22}$/.test(body.track_id)) throw new BridgeError('INVALID_INPUT')
          uri = `spotify:track:${body.track_id}`
        } else if (body.link) {
          uri = spotifyTrackUri(body.link)
          if (!uri) throw new BridgeError('TRACK_LINK_REQUIRED')
        } else if (body.search_title === undefined && body.search_artist === undefined) uri = spotifyTrackUri(song.link)
        if (!uri) {
          const result = await searchSong(song)
          if (!result.automatic) return respond({ ok: false, needs_choice: true, song_id: body.song_id, choices: result.choices })
          uri = `spotify:track:${result.automatic.id}`
        }
        const track = await spotify(`/tracks/${uri.split(':')[2]}`)
        if (!track || track.is_playable === false || track.is_local) throw new BridgeError('TRACK_UNAVAILABLE')
        const playback = await spotify('/me/player')
        if (playback?.device?.id !== config.device_id) throw new BridgeError('START_ON_PC')
        await db('claim_song', { song_id: body.song_id, uri })
        let response: Response
        try { response = await fetchSpotify(`${API}/me/player/queue?uri=${encodeURIComponent(uri)}&${target}`, { method: 'POST', headers: { Authorization: `Bearer ${tokens.access_token}` } }) }
        catch { throw new BridgeError('QUEUE_UNCERTAIN') }
        if (!response.ok) {
          // A server error can occur after acceptance. Keep it uncertain to prevent duplicate sends.
          if (response.status >= 500) throw new BridgeError('QUEUE_UNCERTAIN')
          await db('failed', { song_id: body.song_id })
          throw spotifyHttpError(response.status)
        }
        try { await db('sent', { song_id: body.song_id }) } catch { throw new BridgeError('QUEUE_UNCERTAIN') }
        return respond({ ok: true, title: track.name })
      }
      throw new BridgeError('INVALID_ACTION')
    } catch (error) {
      const allowed = ['NOT_ADMIN','INVALID_INPUT','INVALID_CLIENT','OAUTH_EXPIRED','SPOTIFY_BUSY','DISCONNECT_FIRST','SONG_NOT_READY','ALREADY_DISPATCHED','TRACK_LINK_REQUIRED']
      const code = error instanceof BridgeError ? error.code : allowed.find((code) => String((error as Error)?.message).includes(code)) ?? 'SPOTIFY_UNAVAILABLE'
      diagnostic(code, 'request', error instanceof BridgeError ? error.status : 400)
      return respond({ error: code }, error instanceof BridgeError ? error.status : code === 'NOT_ADMIN' ? 403 : 400)
    } finally {
      if (acquired && admin) { try { await rpc(admin, 'release', {}, lease) } catch { /* The lease expires automatically. */ } }
    }
  }
}
