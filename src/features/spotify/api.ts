import { messages } from './messages'
import { supabase } from '../../lib/supabase'
export type SpotifyState = {
  warning?: string
  client_id: string | null; connected: boolean; device_id: string | null; device_name: string | null; redirect_uri: string
  dispatches: Record<string, { state: 'sent' | 'uncertain'; track_uri: string }>
  devices: { id: string; name: string; type: string; is_active: boolean }[]
  playback: null | { is_playing: boolean; device_id: string; device_name: string; title: string; artists: string; url: string | null }
}
export type SpotifyTrackChoice = { id: string; title: string; artists: string; album: string; duration_ms: number; url: string }
export type SpotifyResult = { ok: boolean; url?: string; title?: string; needs_choice?: boolean; song_id?: string; choices?: SpotifyTrackChoice[] }
export async function spotifyAction<T = SpotifyResult>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error, response } = await supabase.functions.invoke('spotify-jukebox', { body: { ...payload, action } })
  if (error) {
    let code = ''
    if (error.context instanceof Response) { try { code = (await error.context.json()).error ?? '' } catch { /* Not all gateway errors contain JSON. */ } }
    if (!Object.hasOwn(messages, code)) {
      code = response?.status === 401 ? 'NOT_ADMIN'
        : error.name === 'FunctionsFetchError' ? 'BRIDGE_NETWORK'
        : error.name === 'FunctionsRelayError' ? 'BRIDGE_RELAY'
        : error.name === 'SyntaxError' ? 'BRIDGE_RESPONSE' : 'BRIDGE_ERROR'
    }
    const labels: Record<string, string> = { guest_search: 'Recherche', guest_send: 'Envoi', status: 'Actualisation', play: 'Lecture', pause: 'Pause', next: 'Morceau suivant', queue: 'Envoi du morceau', search: 'Recherche Spotify', device: 'Choix du PC', connect: 'Connexion', callback: 'Connexion', disconnect: 'Déconnexion', configure: 'Configuration', resolve: 'Vérification de la file' }
    // Do not log the SDK error object: it can contain request headers or bodies.
    console.warn('spotify_request_failed', { action: Object.hasOwn(labels, action) ? action : 'unknown', code, status: response?.status })
    const guestMessages: Record<string, string> = {
      QUEUE_UNCERTAIN: 'Spotify n’a pas confirmé cet envoi. Ne crée pas une nouvelle proposition : celle-ci est conservée et ne sera pas envoyée deux fois.',
      BRIDGE_NETWORK: 'Connexion interrompue. Ton choix reste ici. Réessaie ce même envoi, sans créer une nouvelle proposition.',
      NOT_ADMIN: messages.IDENTITY_REQUIRED,
    }
    throw new Error(`${labels[action] ?? 'Spotify'} : ${action.startsWith('guest_') ? guestMessages[code] ?? messages[code] : messages[code]}`)
  }
  return data as T
}
