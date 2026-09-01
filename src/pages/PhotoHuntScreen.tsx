import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import PhotoHuntImage from '../features/photo-hunt/PhotoHuntImage'
import {
  type PhotoHuntChallenge,
  type PhotoHuntSubmission,
} from '../features/photo-hunt/photoHunt'
import { supabase } from '../lib/supabase'

import './PhotoHuntScreen.css'
import './PhotoHuntScreenPolish.css'

const WALL_SIZE = 8
const ROTATION_MS = 10000

function diversifyPhotos(photos: PhotoHuntSubmission[]) {
  const buckets = new Map<string, PhotoHuntSubmission[]>()
  const playerOrder: string[] = []

  photos.forEach((photo) => {
    if (!buckets.has(photo.player_key)) {
      buckets.set(photo.player_key, [])
      playerOrder.push(photo.player_key)
    }
    buckets.get(photo.player_key)?.push(photo)
  })

  const diversified: PhotoHuntSubmission[] = []
  let remaining = photos.length

  while (remaining > 0) {
    playerOrder.forEach((playerKey) => {
      const bucket = buckets.get(playerKey)
      const photo = bucket?.shift()
      if (!photo) return
      diversified.push(photo)
      remaining -= 1
    })
  }

  return diversified
}

function PhotoHuntScreen() {
  const [photos, setPhotos] = useState<PhotoHuntSubmission[]>([])
  const [challenges, setChallenges] = useState<PhotoHuntChallenge[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const realtimeConnectedRef = useRef(false)

  const load = useCallback(async () => {
    const [photoResult, challengeResult] = await Promise.all([
      supabase
        .from('photo_hunt_submissions')
        .select('id, challenge_id, player_key, player_name, storage_path, mime_type, caption, status, created_at, moderated_at')
        .eq('status', 'approved')
        .order('moderated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(32),
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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'photo_hunt_challenges' },
        () => void load(),
      )
      .subscribe((status) => {
        realtimeConnectedRef.current = status === 'SUBSCRIBED'
      })

    const fallback = window.setInterval(() => {
      if (!realtimeConnectedRef.current) void load()
    }, 30000)

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      realtimeConnectedRef.current = false
      window.clearInterval(fallback)
      document.removeEventListener('visibilitychange', handleVisibility)
      void supabase.removeChannel(channel)
    }
  }, [load])

  const challengeById = useMemo(
    () => new Map(challenges.map((challenge) => [challenge.id, challenge])),
    [challenges],
  )

  const diversifiedPhotos = useMemo(
    () => diversifyPhotos(photos),
    [photos],
  )

  const pageCount = Math.max(1, Math.ceil(diversifiedPhotos.length / WALL_SIZE))

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount - 1))
  }, [pageCount])

  useEffect(() => {
    if (pageCount <= 1) return

    const interval = window.setInterval(() => {
      setPage((current) => (current + 1) % pageCount)
    }, ROTATION_MS)

    return () => window.clearInterval(interval)
  }, [pageCount])

  const visiblePhotos = useMemo(() => {
    if (diversifiedPhotos.length <= WALL_SIZE) return diversifiedPhotos

    const start = page * WALL_SIZE
    return Array.from(
      { length: Math.min(WALL_SIZE, diversifiedPhotos.length) },
      (_, index) => diversifiedPhotos[(start + index) % diversifiedPhotos.length],
    )
  }, [diversifiedPhotos, page])

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
        <b>
          {photos.length} photo{photos.length !== 1 ? 's' : ''} publiée{photos.length !== 1 ? 's' : ''}
          {pageCount > 1 ? ` · mur ${page + 1}/${pageCount}` : ''}
        </b>
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
            {pageCount > 1 && (
              <div className="photo-hunt-screen__rotation">
                <strong>Rotation auto</strong>
                <span>Le mur change toutes les 10 s et mélange les participants.</span>
                <i key={page} />
              </div>
            )}
          </div>

          <div
            key={page}
            className={`photo-hunt-screen__wall photo-hunt-screen__wall--${Math.min(visiblePhotos.length, WALL_SIZE)}`}
          >
            {visiblePhotos.map((photo, index) => (
              <article key={`${page}:${photo.id}`} className={`photo-hunt-screen__photo photo-hunt-screen__photo--${index + 1}`}>
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