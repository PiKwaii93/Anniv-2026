import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { emptyHallOfFame, fetchHallOfFame } from './hallOfFame'

export function useHallOfFame(includePhotos: boolean, enabled = true) {
  const [hall, setHall] = useState(emptyHallOfFame)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let busy = false
    let reload = false
    const load = async () => {
      if (cancelled) return
      if (busy) { reload = true; return }
      busy = true
      try {
        const next = await fetchHallOfFame(includePhotos)
        if (!cancelled) { setHall(next); setError(next.photoError ?? '') }
      } catch {
        if (!cancelled) setError('Le palmarès n’a pas pu être synchronisé. Nouvelle tentative automatique…')
      } finally {
        busy = false
        if (!cancelled) setLoading(false)
        if (reload && !cancelled) { reload = false; void load() }
      }
    }
    void load()
    let channel = supabase.channel(`hall-of-fame-${crypto.randomUUID()}`)
    const tables = ['beer_pong_state', 'secret_mission_scoreboard', 'live_vote_public_state']
    if (includePhotos) tables.push('photo_hunt_submissions')
    tables.forEach((table) => {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => void load())
    })
    channel.subscribe()
    const interval = window.setInterval(() => void load(), 30000)
    const onVisible = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      void supabase.removeChannel(channel)
    }
  }, [includePhotos, enabled])

  return { hall, loading, error, available: hall !== emptyHallOfFame }
}
