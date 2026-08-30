import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import PhotoHuntImage from '../features/photo-hunt/PhotoHuntImage'
import {
  type PhotoHuntChallenge,
  type PhotoHuntSubmission,
} from '../features/photo-hunt/photoHunt'
import { supabase } from '../lib/supabase'

import './PhotoHuntScreen.css'

function PhotoHuntScreen() {
  const [photos, setPhotos] = useState<PhotoHuntSubmission[]>([])
  const [challenges, setChallenges] = useState<PhotoHuntChallenge[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [photoResult, challengeResult] = await Promise.all([
      supabase
        .from('photo_hunt_submissions')
        .select('id, challenge_id, player_key, player_name, storage_path, mime_type, caption, status, created_at, moderated_at')
        .eq('status', 'approved')
        .order('moderated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(8),
      supabase
        .from('photo_hunt_challenges')
        .select('id, prompt, hint, sort_order, is_active')
        .eq('is_active', true),
    ])

    if (!photoResult.error) {
      setPhotos((photoResult.data ?? []) as PhotoHuntSubmission[])
    } else {
      console.error('Unable to load Photo Hunt TV photos:', photoResult.error)
    }

    if (!challengeResult.error) {
      setChallenges((challengeResult.data ?? []) as PhotoHuntChallenge[])
    } else {
      console.error('Unable to load Photo Hunt TV challenges:', challengeResult.error)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel('anniv-2026-photo-hunt-screen')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'photo_hunt_submissions' },
        () => void load(),
      )
      .subscribe()

    const fallback = window.setInterval(() => void load(), 15000)

    return () => {
      window.clearInterval(fallback)
      void supabase.removeChannel(channel)
    }
  }, [load])

  const challengeById = useMemo(
    () => new Map(challenges.map((challenge) => [challenge.id, challenge])),
    [challenges],
  )

  if (loading) {
    return (
      <main className="photo-hunt-screen photo-hunt-screen--loading">
        <p>Connexion au mur photo…</p>
      </main>
    )
  }

  return (
    <main className="photo-hunt-screen">
      <div className="photo-hunt-screen__glow photo-hunt-screen__glow--one" />
      <div className="photo-hunt-screen__glow photo-hunt-screen__glow--two" />

      <header className="photo-hunt-screen__topline">
        <div><span /> Photo Hunt · mur live</div>
        <b>{photos.length} dernière{photos.length !== 1 ? 's' : ''} photo{photos.length !== 1 ? 's' : ''}</b>
      </header>

      {photos.length === 0 ? (
        <section className="photo-hunt-screen__empty">
          <p>Chasse photo</p>
          <h1>À vous de<br />remplir le mur.</h1>
          <span>Les photos validées par la régie apparaîtront ici en direct.</span>
          <div className="photo-hunt-screen__qr">
            <img src="/anniv-2026-qr.svg" alt="QR code Anniv 2026" />
            <strong>Scanne · ouvre Photo Hunt</strong>
          </div>
        </section>
      ) : (
        <section className="photo-hunt-screen__layout">
          <div className="photo-hunt-screen__heading">
            <p>Souvenirs en direct</p>
            <h1>Photo<br /><span>Hunt</span></h1>
            <div>
              <img src="/anniv-2026-qr.svg" alt="QR code Anniv 2026" />
              <span>Scanne pour participer</span>
            </div>
          </div>

          <div className={`photo-hunt-screen__wall photo-hunt-screen__wall--${Math.min(photos.length, 8)}`}>
            {photos.map((photo, index) => (
              <article key={photo.id} className={`photo-hunt-screen__photo photo-hunt-screen__photo--${index + 1}`}>
                <PhotoHuntImage
                  path={photo.storage_path}
                  alt={`Photo de ${photo.player_name}`}
                  className="photo-hunt-screen__image"
                />
                <div>
                  <strong>{photo.player_name}</strong>
                  <span>{challengeById.get(photo.challenge_id)?.prompt ?? 'Défi Photo Hunt'}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}

export default PhotoHuntScreen
