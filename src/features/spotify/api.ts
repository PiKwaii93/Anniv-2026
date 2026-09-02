import { messages } from './messages'
import { supabase } from '../../lib/supabase'
export type SpotifyState = {
  warning?: string
  client_id: string | null; connected: boolean; device_id: string | null; device_name: string | null; redirect_uri: string
  dispatches: Record<string, { state: 'sent' | 'uncertain'; track_uri: string }>
  devices: { id: string; name: string; type: string; is_active: boolean }[]
  playback: null | { is_playing: boolean; device_id: string; device_name: string; title: string; artists: string; url: string | null }
}
export async function spotifyAction<T = { ok: boolean; url?: string; title?: string }>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('spotify-jukebox', { body: { ...payload, action } })
  if (error) {
    let code = ''
    if (error.context instanceof Response) { try { code = (await error.context.json()).error ?? '' } catch { /* Not all gateway errors contain JSON. */ } }
    throw new Error(messages[code] ?? 'Spotify ne répond pas pour le moment. Réessaie dans quelques instants.')
  }
  return data as T
}
