import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { PhotoHuntChallenge, PhotoHuntSubmission } from '../features/photo-hunt/photoHunt'
import { PhotoHuntMasonry } from '../features/photo-hunt/PhotoHuntMasonry'
import './PartyScreen.css'
import './PhotoHuntScreenPolish.css'
import './PhotoHuntScreen.css'

export function PhotoHuntScreen() {
  const [photos, setPhotos] = useState<PhotoHuntSubmission[]>([])
  const [challenges, setChallenges] = useState<PhotoHuntChallenge[]>([])
  const [loading, setLoading] = useState(true)
  const latestRequestRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => () => {
    mountedRef.current = false
  }, [])

  const load = useCallback(async () => {
    const requestId = ++latestRequestRef.current
    const [{ data: photoData, error: photoError }, { data: challengeData, error: challengeError }] = await Promise.all([
      supabase
        .from('photo_hunt_submissions')
        .select('id, challenge_id, player_name, storage_path, image_width, image_height, status, created_at, moderated_at')
        .eq('status', 'approved')
        .order('created_at', { ascending: true })
        .limit(1000),
      supabase
        .from('photo_hunt_challenges')
        .select('id, prompt, hint, sort_order, is_active')
        .order('sort_order', { ascending: true }),
    ])

    if (!mountedRef.current || requestId !== latestRequestRef.current) return

    if (photoError || challengeError) {
      console.error('[PhotoHunt][TV_LOAD_ERROR]', {
        photos: photoError?.message,
        challenges: challengeError?.message,
      })
      setLoading(false)
      return
    }

    setPhotos((photoData as PhotoHuntSubmission[] | null) ?? [])
    setChallenges((challengeData as PhotoHuntChallenge[] | null) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
    const channel = supabase
      .channel('photo-hunt-screen')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photo_hunt_submissions' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photo_hunt_challenges' }, () => void load())
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[PhotoHunt][TV_REALTIME_FALLBACK]', status)
        }
      })

    const poll = window.setInterval(() => void load(), 5000)
    return () => {
      window.clearInterval(poll)
      void supabase.removeChannel(channel)
    }
  }, [load])

  const challengeById = useMemo(
    () => new Map(challenges.map((challenge) => [challenge.id, challenge])),
    [challenges],
  )

  return (
    <main className="party-screen photo-hunt-screen">
      <div className="party-screen__meta">
        <span><i aria-hidden="true" /> Photo Hunt · mur live</span>
        <span>{photos.length} photo{photos.length > 1 ? 's' : ''} publiée{photos.length > 1 ? 's' : ''}</span>
      </div>

      <section className="photo-hunt-screen__layout">
        <div className="photo-hunt-screen__heading">
          <p className="party-screen__eyebrow">Souvenirs en direct</p>
          <h1 className="photo-hunt-screen__title">Photo <em>Hunt.</em></h1>
          <div className="photo-hunt-screen__scan" aria-label="QR code de participation">
            <img src="/anniv-2026-qr.svg" alt="QR code Anniv 2026" className="photo-hunt-screen__qr" />
            <span>Scanne pour<br />participer</span>
          </div>
          <div className="photo-hunt-screen__rotation" aria-label="Défilement automatique">
            <strong>Défilement continu</strong>
            <span>Les nouveaux souvenirs rejoignent le mur en direct.</span>
            <i aria-hidden="true" />
          </div>
        </div>

        {loading ? (
          <p className="photo-hunt-screen__empty">Connexion au mur photo…</p>
        ) : photos.length === 0 ? (
          <p className="photo-hunt-screen__empty">Les premières photos vont apparaître ici. À vous de remplir le mur.</p>
        ) : (
          <PhotoHuntMasonry photos={photos} challengeById={challengeById} />
        )}
      </section>
    </main>
  )
}

export default PhotoHuntScreen
