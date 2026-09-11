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
import {
  buildPhotoPages,
  buildPhotoRows,
  getPhotoAspectRatio,
  PHOTO_WALL_PAGE_SIZE,
} from '../features/photo-hunt/photoWallLayout'
import { supabase } from '../lib/supabase'

import './PhotoHuntScreen.css'
import './PhotoHuntScreenPolish.css'

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
        .select('id, challenge_id, player_key, player_name, storage_path, mime_type, image_width, image_height, caption, status, created_at, moderated_at')
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
    const nextPhotos = (photoResult.data ?? []) as PhotoHuntSubmission[]
    const nextPageCount = Math.max(1, Math.ceil(nextPhotos.length / PHOTO_WALL_PAGE_SIZE))
    setPhotos(nextPhotos)
    setPage((current) => Math.min(current, nextPageCount - 1))
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

  const photoPages = useMemo(
    () => buildPhotoPages(diversifiedPhotos),
    [diversifiedPhotos],
  )
  const pageCount = Math.max(1, photoPages.length)
  const displayPage = page % pageCount

  useEffect(() => {
    if (pageCount <= 1) return

    const interval = window.setInterval(() => {
      setPage((current) => (current + 1) % pageCount)
    }, ROTATION_MS)

    return () => window.clearInterval(interval)
  }, [pageCount])

  const visiblePhotos = useMemo(() => {
    if (photoPages.length === 0) return []
    return photoPages[displayPage]
  }, [displayPage, photoPages])

  useEffect(() => {
    if (visiblePhotos.length === 0) return
    console.info('[PhotoHunt][TV_PAGE]', {
      page: displayPage + 1,
      pageCount,
      photoCount: visiblePhotos.length,
      photos: visiblePhotos.map((photo) => ({
        photoId: photo.id,
        storedWidth: photo.image_width ?? null,
        storedHeight: photo.image_height ?? null,
      })),
    })
  }, [displayPage, pageCount, visiblePhotos])

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
          {pageCount > 1 ? ` · mur ${displayPage + 1}/${pageCount}` : ''}
        </b>
      </header>

      {photos.length === 0 ? (
        <section className="photo-hunt-screen__empty">
          <p>Chasse photo</p>
          <h1>À vous de<br />remplir le mur.</h1>
          <span>Les photos envoyées apparaîtront ici en direct.</span>
          <div className="photo-hunt-screen__qr">
            <img src="/anniv-2026-qr.svg" alt="QR code Anniv 2026" />
            <strong>Scanne · ouvre Photo Hunt</strong>
          </div>
        </section>
      ) : (
        <section className="photo-hunt-screen__layout">
          <div className="photo-hunt-screen__heading">
            <p>Souvenirs en direct</p>
            <h1>Photo<br /><span>Hunt.</span></h1>
            <div>
              <img src="/anniv-2026-qr.svg" alt="QR code Anniv 2026" />
              <span>Scanne pour participer</span>
            </div>
            {pageCount > 1 && (
              <div className="photo-hunt-screen__rotation">
                <strong>Rotation auto</strong>
                <span>Jusqu’à 6 souvenirs différents toutes les 10 s.</span>
                <i key={displayPage} />
              </div>
            )}
          </div>

          <div
            key={displayPage}
            className={`photo-hunt-screen__wall photo-hunt-screen__wall--${visiblePhotos.length}`}
          >
            {buildPhotoRows(visiblePhotos).map((row, rowIndex, rows) => (
              <div
                key={`${displayPage}:row:${rowIndex}`}
                className="photo-hunt-screen__row"
                style={{ maxWidth: `${row.ratio * (rows.length === 1 ? 68 : 32)}vh` }}
              >
              {row.photos.map((photo) => (
              <article
                key={`${displayPage}:${photo.id}`}
                className="photo-hunt-screen__photo"
                style={{ flexGrow: getPhotoAspectRatio(photo) }}
              >
                <PhotoHuntImage
                  path={photo.storage_path}
                  alt={`Photo de ${photo.player_name}`}
                  className="photo-hunt-screen__image"
                  debugLayout
                />
                <strong className="photo-hunt-screen__author">{photo.player_name}</strong>
                <span className="photo-hunt-screen__caption">{challengeById.get(photo.challenge_id)?.prompt ?? 'Défi Photo Hunt'}</span>
              </article>
              ))}
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}

export default PhotoHuntScreen
