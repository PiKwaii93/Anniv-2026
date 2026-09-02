import { useCallback, useEffect, useRef, useState } from 'react'
import { spotifyAction, type SpotifyState } from './api'

export function useSpotify() {
  const [data, setData] = useState<SpotifyState | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const mounted = useRef(false)
  const pending = useRef(false)
  const load = useCallback(async () => {
    try {
      const state = await spotifyAction<SpotifyState>('status')
      if (mounted.current) setData(state)
    } catch (cause) { if (mounted.current) setError((cause as Error).message) }
  }, [])
  const refresh = useCallback(async () => {
    if (pending.current) return
    pending.current = true
    try { await load() } finally { pending.current = false }
  }, [load])
  useEffect(() => {
    mounted.current = true
    void refresh()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 30000)
    const visible = () => { if (document.visibilityState === 'visible') void refresh() }
    document.addEventListener('visibilitychange', visible)
    return () => { mounted.current = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', visible) }
  }, [refresh])
  const run = async (action: string, payload: Record<string, unknown> = {}) => {
    if (pending.current) return false
    pending.current = true; setBusy(true); setError(''); setNotice('')
    try {
      const result = await spotifyAction(action, payload)
      if (action === 'connect' && result.url) {
        const url = new URL(result.url)
        if (url.origin !== 'https://accounts.spotify.com' || url.pathname !== '/authorize') throw new Error('Adresse de connexion Spotify invalide.')
        window.location.assign(result.url)
        return true
      }
      if (mounted.current) setNotice(action === 'queue' ? `« ${result.title} » a rejoint la file Spotify du PC.` : action === 'disconnect' ? 'Spotify est déconnecté du site.' : 'Commande enregistrée.')
      await load()
      return true
    } catch (cause) {
      if (mounted.current) setError((cause as Error).message)
      await load()
      return false
    } finally { pending.current = false; if (mounted.current) setBusy(false) }
  }
  return { data, busy, error, notice, refresh, run }
}
export type SpotifyController = ReturnType<typeof useSpotify>
