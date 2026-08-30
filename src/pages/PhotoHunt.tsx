import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link } from 'react-router-dom'

import { usePartyIdentity } from '../features/identity/PartyIdentityContext'
import PhotoHuntImage from '../features/photo-hunt/PhotoHuntImage'
import {
  compressPhoto,
  photoHuntError,
  stableChallengeOrder,
  type CompressedPhoto,
  type PhotoHuntChallenge,
  type PhotoHuntFinalizeResult,
  type PhotoHuntOwnSubmission,
  type PhotoHuntPlayerState,
  type PhotoHuntSubmission,
  type PhotoHuntUploadSlot,
} from '../features/photo-hunt/photoHunt'
import { supabase } from '../lib/supabase'

import './PhotoHunt.css'

type PreparedPhoto = CompressedPhoto & {
  previewUrl: string
}

function PhotoHunt() {
  const { identity } = usePartyIdentity()
  const [challenges, setChallenges] = useState<PhotoHuntChallenge[]>([])
  const [ownSubmissions, setOwnSubmissions] = useState<PhotoHuntOwnSubmission[]>([])
  const [gallery, setGallery] = useState<PhotoHuntSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedChallenge, setSelectedChallenge] = useState<PhotoHuntChallenge | null>(null)
  const [preparedPhoto, setPreparedPhoto] = useState<PreparedPhoto | null>(null)
  const [caption, setCaption] = useState('')
  const [processing, setProcessing] = useState(false)
  const [sending, setSending] = useState(false)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  const clearPreparedPhoto = useCallback(() => {
    setPreparedPhoto((current) => {
      if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl)
      return null
    })
  }, [])

  const loadData = useCallback(async () => {
    if (!identity) return

    const [challengeResult, galleryResult, stateResult] = await Promise.all([
      supabase
        .from('photo_hunt_challenges')
        .select('id, prompt, hint, sort_order, is_active, created_at, updated_at')
        .eq('is_active', true)
        .order('sort_order')
        .order('created_at'),
      supabase
        .from('photo_hunt_submissions')
        .select('id, challenge_id, player_key, player_name, storage_path, mime_type, caption, status, created_at, moderated_at')
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(18),
      supabase.rpc('get_photo_hunt_player_state', {
        p_player_key: identity.playerKey,
        p_session_token: identity.sessionToken,
      }),
    ])

    let failed = false

    if (challengeResult.error) {
      console.error('Unable to load Photo Hunt challenges:', challengeResult.error)
      failed = true
    } else {
      setChallenges((challengeResult.data ?? []) as PhotoHuntChallenge[])
    }

    if (galleryResult.error) {
      console.error('Unable to load Photo Hunt gallery:', galleryResult.error)
      failed = true
    } else {
      setGallery((galleryResult.data ?? []) as PhotoHuntSubmission[])
    }

    if (stateResult.error) {
      console.error('Unable to load Photo Hunt player state:', stateResult.error)
      failed = true
    } else {
      const state = stateResult.data as PhotoHuntPlayerState
      if (state.ok) {
        setOwnSubmissions(state.submissions ?? [])
      } else {
        failed = true
      }
    }

    setError(failed ? 'Certaines données Photo Hunt n’ont pas pu être synchronisées.' : '')
    setLoading(false)
  }, [identity])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    const channel = supabase
      .channel('anniv-2026-photo-hunt-public')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'photo_hunt_submissions' },
        () => void loadData(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'photo_hunt_challenges' },
        () => void loadData(),
      )
      .subscribe()

    const fallback = window.setInterval(() => void loadData(), 15000)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void loadData()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.clearInterval(fallback)
      document.removeEventListener('visibilitychange', handleVisibility)
      void supabase.removeChannel(channel)
    }
  }, [loadData])

  useEffect(() => () => {
    if (preparedPhoto?.previewUrl) URL.revokeObjectURL(preparedPhoto.previewUrl)
  }, [preparedPhoto])

  const submissionByChallenge = useMemo(
    () => new Map(ownSubmissions.map((submission) => [submission.challengeId, submission])),
    [ownSubmissions],
  )

  const orderedChallenges = useMemo(
    () => identity ? stableChallengeOrder(identity.playerKey, challenges) : challenges,
    [challenges, identity],
  )

  const spotlight = useMemo(() => {
    const available = orderedChallenges.filter((challenge) => {
      const status = submissionByChallenge.get(challenge.id)?.status
      return status !== 'approved' && status !== 'pending'
    })
    return available.slice(0, 3)
  }, [orderedChallenges, submissionByChallenge])

  const approvedCount = ownSubmissions.filter((submission) => submission.status === 'approved').length
  const pendingCount = ownSubmissions.filter((submission) => submission.status === 'pending').length
  const challengeById = useMemo(
    () => new Map(challenges.map((challenge) => [challenge.id, challenge])),
    [challenges],
  )

  const openChallenge = (challenge: PhotoHuntChallenge) => {
    const status = submissionByChallenge.get(challenge.id)?.status
    if (status === 'approved' || status === 'pending') return
    clearPreparedPhoto()
    setCaption('')
    setError('')
    setSelectedChallenge(challenge)
  }

  const closeComposer = () => {
    if (sending) return
    clearPreparedPhoto()
    setCaption('')
    setSelectedChallenge(null)
  }

  const prepareFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setProcessing(true)
    setError('')

    try {
      const compressed = await compressPhoto(file)
      clearPreparedPhoto()
      setPreparedPhoto({
        ...compressed,
        previewUrl: URL.createObjectURL(compressed.blob),
      })
    } catch (processingError) {
      console.error('Unable to prepare Photo Hunt image:', processingError)
      setError(
        processingError instanceof Error
          ? photoHuntError(processingError.message)
          : photoHuntError(),
      )
    } finally {
      setProcessing(false)
    }
  }

  const sendPhoto = async () => {
    if (!identity || !selectedChallenge || !preparedPhoto || sending) return

    setSending(true)
    setError('')

    try {
      const { data: slotData, error: slotError } = await supabase.rpc(
        'create_photo_hunt_upload_slot',
        {
          p_player_key: identity.playerKey,
          p_session_token: identity.sessionToken,
          p_challenge_id: selectedChallenge.id,
          p_mime_type: preparedPhoto.blob.type,
          p_size_bytes: preparedPhoto.blob.size,
        },
      )

      if (slotError) throw slotError

      const slot = slotData as PhotoHuntUploadSlot
      if (!slot.ok || !slot.slotId || !slot.storagePath) {
        setError(photoHuntError(slot.code))
        return
      }

      const uploadResult = await supabase.storage
        .from('photo-hunt')
        .upload(slot.storagePath, preparedPhoto.blob, {
          contentType: preparedPhoto.blob.type,
          cacheControl: '3600',
          upsert: false,
        })

      if (uploadResult.error) {
        console.warn('Photo Hunt upload returned an error, attempting finalize:', uploadResult.error)
      }

      const { data: finalizeData, error: finalizeError } = await supabase.rpc(
        'finalize_photo_hunt_upload',
        {
          p_slot_id: slot.slotId,
          p_player_key: identity.playerKey,
          p_session_token: identity.sessionToken,
          p_caption: caption.trim() || null,
        },
      )

      if (finalizeError) throw finalizeError

      const result = finalizeData as PhotoHuntFinalizeResult
      if (!result.ok) {
        setError(photoHuntError(result.code))
        return
      }

      clearPreparedPhoto()
      setCaption('')
      setSelectedChallenge(null)
      await loadData()
    } catch (uploadError) {
      console.error('Unable to submit Photo Hunt image:', uploadError)
      setError('L’envoi de la photo a échoué. Tu peux réessayer sans perdre ton défi.')
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <main className="photo-hunt photo-hunt--loading">
        <p>Ouverture de l’appareil photo…</p>
      </main>
    )
  }

  return (
    <main className="photo-hunt">
      <div className="photo-hunt__glow photo-hunt__glow--one" />
      <div className="photo-hunt__glow photo-hunt__glow--two" />

      <header className="photo-hunt__hero">
        <Link to="/" className="back-link">← Accueil</Link>
        <p className="photo-hunt__eyebrow">Anniv 2026 · chasse photo</p>
        <h1>Photo<br /><span>Hunt</span></h1>
        <p>
          Relève les défis, capture la soirée et alimente le mur photo. Chaque image passe par la régie avant d’être publiée.
        </p>

        <div className="photo-hunt__stats">
          <div><strong>{approvedCount}</strong><span>validée{approvedCount !== 1 ? 's' : ''}</span></div>
          <div><strong>{pendingCount}</strong><span>en validation</span></div>
          <div><strong>{challenges.length}</strong><span>défis actifs</span></div>
        </div>
      </header>

      {error && <div className="photo-hunt__error">{error}</div>}

      {spotlight.length > 0 && (
        <section className="photo-hunt__section">
          <div className="photo-hunt__section-title">
            <div>
              <p>Pour toi</p>
              <h2>3 défis à tenter maintenant</h2>
            </div>
            <span>Choisis-en un</span>
          </div>

          <div className="photo-hunt__spotlight">
            {spotlight.map((challenge, index) => (
              <button
                key={challenge.id}
                type="button"
                className="photo-hunt__spotlight-card"
                onClick={() => openChallenge(challenge)}
              >
                <span>0{index + 1}</span>
                <strong>{challenge.prompt}</strong>
                {challenge.hint && <small>{challenge.hint}</small>}
                <b>Faire ce défi →</b>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="photo-hunt__section">
        <div className="photo-hunt__section-title">
          <div>
            <p>Checklist</p>
            <h2>Tous les défis</h2>
          </div>
          <span>{approvedCount + pendingCount} / {challenges.length} tentés</span>
        </div>

        <div className="photo-hunt__challenge-list">
          {orderedChallenges.map((challenge) => {
            const submission = submissionByChallenge.get(challenge.id)
            const status = submission?.status
            const label =
              status === 'approved'
                ? 'Validée ✓'
                : status === 'pending'
                  ? 'En validation'
                  : status === 'rejected'
                    ? 'À refaire'
                    : 'Disponible'

            return (
              <button
                key={challenge.id}
                type="button"
                disabled={status === 'approved' || status === 'pending'}
                className={`photo-hunt__challenge photo-hunt__challenge--${status ?? 'available'}`}
                onClick={() => openChallenge(challenge)}
              >
                <span className="photo-hunt__challenge-state">{label}</span>
                <strong>{challenge.prompt}</strong>
                {challenge.hint && <small>{challenge.hint}</small>}
              </button>
            )
          })}
        </div>
      </section>

      <section className="photo-hunt__section photo-hunt__gallery-section">
        <div className="photo-hunt__section-title">
          <div>
            <p>Mur collectif</p>
            <h2>Les photos validées</h2>
          </div>
          <span>{gallery.length > 0 ? 'Dernières publications' : 'Le mur se remplit bientôt'}</span>
        </div>

        {gallery.length === 0 ? (
          <div className="photo-hunt__empty-gallery">
            <span>◫</span>
            <strong>Pas encore de photo publiée</strong>
            <p>Les premières validations de la régie apparaîtront ici automatiquement.</p>
          </div>
        ) : (
          <div className="photo-hunt__gallery">
            {gallery.map((photo) => (
              <article key={photo.id} className="photo-hunt__gallery-card">
                <PhotoHuntImage
                  path={photo.storage_path}
                  alt={`Photo de ${photo.player_name}`}
                  className="photo-hunt__gallery-image"
                />
                <div>
                  <span>{photo.player_name}</span>
                  <strong>{challengeById.get(photo.challenge_id)?.prompt ?? 'Défi Photo Hunt'}</strong>
                  {photo.caption && <p>{photo.caption}</p>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {selectedChallenge && (
        <div className="photo-hunt-composer-backdrop" role="presentation" onClick={closeComposer}>
          <section
            className="photo-hunt-composer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="photo-hunt-composer-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="photo-hunt-composer__close"
              aria-label="Fermer"
              disabled={sending}
              onClick={closeComposer}
            >
              ×
            </button>

            <p className="photo-hunt__eyebrow">Ton défi</p>
            <h2 id="photo-hunt-composer-title">{selectedChallenge.prompt}</h2>
            {selectedChallenge.hint && <p className="photo-hunt-composer__hint">{selectedChallenge.hint}</p>}

            {preparedPhoto ? (
              <div className="photo-hunt-composer__preview-wrap">
                <img
                  src={preparedPhoto.previewUrl}
                  alt="Aperçu de ta photo"
                  className="photo-hunt-composer__preview"
                />
                <button type="button" disabled={sending} onClick={clearPreparedPhoto}>Changer de photo</button>
              </div>
            ) : (
              <div className="photo-hunt-composer__pickers">
                <button
                  type="button"
                  disabled={processing}
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <span>📷</span>
                  <strong>Prendre une photo</strong>
                  <small>Ouvre directement l’appareil photo</small>
                </button>
                <button
                  type="button"
                  disabled={processing}
                  onClick={() => galleryInputRef.current?.click()}
                >
                  <span>▧</span>
                  <strong>Choisir dans la galerie</strong>
                  <small>Utilise une photo prise pendant la soirée</small>
                </button>
              </div>
            )}

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(event) => void prepareFile(event)}
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => void prepareFile(event)}
            />

            {processing && <p className="photo-hunt-composer__processing">Compression de la photo…</p>}

            <label className="photo-hunt-composer__caption">
              <span>Légende <small>optionnelle</small></span>
              <input
                value={caption}
                maxLength={160}
                disabled={sending}
                placeholder="Un mot sur cette photo…"
                onChange={(event) => setCaption(event.target.value)}
              />
              <small>{caption.length}/160</small>
            </label>

            <button
              type="button"
              className="photo-hunt-composer__send"
              disabled={!preparedPhoto || processing || sending}
              onClick={() => void sendPhoto()}
            >
              {sending ? 'Envoi en cours…' : 'Envoyer à la régie →'}
            </button>

            <p className="photo-hunt-composer__privacy">
              La photo reste privée tant qu’un admin ne l’a pas validée.
            </p>
          </section>
        </div>
      )}
    </main>
  )
}

export default PhotoHunt
