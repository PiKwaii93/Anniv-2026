import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { Link } from 'react-router-dom'

import PhotoHuntImage from '../features/photo-hunt/PhotoHuntImage'
import {
  type PhotoHuntChallenge,
  type PhotoHuntSubmission,
  type PhotoHuntSubmissionStatus,
} from '../features/photo-hunt/photoHunt'
import {
  type PartyModule,
  useParty,
} from '../features/party/PartyContext'
import { supabase } from '../lib/supabase'

import './PhotoHuntAdmin.css'

type ChallengeDraft = {
  prompt: string
  hint: string
}

const emptyDraft: ChallengeDraft = {
  prompt: '',
  hint: '',
}

function PhotoHuntAdmin() {
  const { settings, updateSettings } = useParty()
  const [challenges, setChallenges] = useState<PhotoHuntChallenge[]>([])
  const [submissions, setSubmissions] = useState<PhotoHuntSubmission[]>([])
  const [draft, setDraft] = useState<ChallengeDraft>(emptyDraft)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<ChallengeDraft>(emptyDraft)
  const [filter, setFilter] = useState<'all' | PhotoHuntSubmissionStatus>('pending')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const loadData = useCallback(async () => {
    const [challengeResult, submissionResult] = await Promise.all([
      supabase
        .from('photo_hunt_challenges')
        .select('id, prompt, hint, sort_order, is_active, created_at, updated_at')
        .order('sort_order')
        .order('created_at'),
      supabase
        .from('photo_hunt_submissions')
        .select('id, challenge_id, player_key, player_name, storage_path, mime_type, caption, status, created_at, moderated_at')
        .order('created_at', { ascending: false }),
    ])

    let failed = false

    if (challengeResult.error) {
      console.error('Unable to load Photo Hunt admin challenges:', challengeResult.error)
      failed = true
    } else {
      setChallenges((challengeResult.data ?? []) as PhotoHuntChallenge[])
    }

    if (submissionResult.error) {
      console.error('Unable to load Photo Hunt admin submissions:', submissionResult.error)
      failed = true
    } else {
      setSubmissions((submissionResult.data ?? []) as PhotoHuntSubmission[])
    }

    setError(failed ? 'Certaines données Photo Hunt n’ont pas pu être chargées.' : '')
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    const channel = supabase
      .channel('anniv-2026-photo-hunt-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photo_hunt_submissions' }, () => void loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photo_hunt_challenges' }, () => void loadData())
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [loadData])

  const challengeById = useMemo(
    () => new Map(challenges.map((challenge) => [challenge.id, challenge])),
    [challenges],
  )

  const pendingCount = submissions.filter((submission) => submission.status === 'pending').length
  const approvedCount = submissions.filter((submission) => submission.status === 'approved').length
  const rejectedCount = submissions.filter((submission) => submission.status === 'rejected').length
  const activeCount = challenges.filter((challenge) => challenge.is_active).length

  const visibleSubmissions = useMemo(() => {
    const rows = filter === 'all'
      ? submissions
      : submissions.filter((submission) => submission.status === filter)

    const rank: Record<PhotoHuntSubmissionStatus, number> = {
      pending: 0,
      approved: 1,
      rejected: 2,
    }

    return [...rows].sort((left, right) => {
      const statusDiff = rank[left.status] - rank[right.status]
      if (statusDiff !== 0) return statusDiff
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
    })
  }, [filter, submissions])

  const createChallenge = async () => {
    const prompt = draft.prompt.trim()
    if (!prompt || busy) return

    setBusy('create')
    setError('')

    const nextOrder = challenges.reduce(
      (maximum, challenge) => Math.max(maximum, challenge.sort_order),
      0,
    ) + 10

    const { error: insertError } = await supabase
      .from('photo_hunt_challenges')
      .insert({
        prompt,
        hint: draft.hint.trim() || null,
        sort_order: nextOrder,
        is_active: true,
      })

    setBusy('')

    if (insertError) {
      console.error('Unable to create Photo Hunt challenge:', insertError)
      setError(insertError.code === '23505' ? 'Ce défi existe déjà.' : 'Impossible d’ajouter ce défi.')
      return
    }

    setDraft(emptyDraft)
    await loadData()
  }

  const startEdit = (challenge: PhotoHuntChallenge) => {
    setEditingId(challenge.id)
    setEditDraft({
      prompt: challenge.prompt,
      hint: challenge.hint ?? '',
    })
  }

  const saveEdit = async (challenge: PhotoHuntChallenge) => {
    const prompt = editDraft.prompt.trim()
    if (!prompt || busy) return

    setBusy(`edit:${challenge.id}`)
    setError('')

    const { error: updateError } = await supabase
      .from('photo_hunt_challenges')
      .update({
        prompt,
        hint: editDraft.hint.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', challenge.id)

    setBusy('')

    if (updateError) {
      console.error('Unable to update Photo Hunt challenge:', updateError)
      setError(updateError.code === '23505' ? 'Un défi avec ce texte existe déjà.' : 'Impossible de modifier ce défi.')
      return
    }

    setEditingId(null)
    await loadData()
  }

  const toggleChallenge = async (challenge: PhotoHuntChallenge) => {
    if (busy) return
    setBusy(`toggle:${challenge.id}`)

    const { error: updateError } = await supabase
      .from('photo_hunt_challenges')
      .update({
        is_active: !challenge.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', challenge.id)

    setBusy('')

    if (updateError) {
      console.error('Unable to toggle Photo Hunt challenge:', updateError)
      setError('Impossible de changer la visibilité de ce défi.')
      return
    }

    await loadData()
  }

  const deleteChallenge = async (challenge: PhotoHuntChallenge) => {
    if (busy || !window.confirm(`Supprimer le défi « ${challenge.prompt} » ?`)) return
    setBusy(`delete-challenge:${challenge.id}`)

    const { error: deleteError } = await supabase
      .from('photo_hunt_challenges')
      .delete()
      .eq('id', challenge.id)

    setBusy('')

    if (deleteError) {
      console.error('Unable to delete Photo Hunt challenge:', deleteError)
      setError('Ce défi a déjà des photos liées. Désactive-le plutôt que de le supprimer.')
      return
    }

    await loadData()
  }

  const moderate = async (
    submission: PhotoHuntSubmission,
    status: 'approved' | 'rejected',
  ) => {
    if (busy) return
    setBusy(`${status}:${submission.id}`)
    setError('')

    const { error: updateError } = await supabase
      .from('photo_hunt_submissions')
      .update({
        status,
        moderated_at: new Date().toISOString(),
      })
      .eq('id', submission.id)

    setBusy('')

    if (updateError) {
      console.error('Unable to moderate Photo Hunt submission:', updateError)
      setError('La décision n’a pas pu être enregistrée.')
      return
    }

    await loadData()
  }

  const deleteSubmission = async (submission: PhotoHuntSubmission) => {
    if (busy || !window.confirm('Supprimer définitivement cette photo ?')) return
    setBusy(`delete:${submission.id}`)
    setError('')

    const { error: storageError } = await supabase.storage
      .from('photo-hunt')
      .remove([submission.storage_path])

    if (storageError) {
      console.error('Unable to remove Photo Hunt object:', storageError)
      setBusy('')
      setError('Le fichier n’a pas pu être supprimé du stockage.')
      return
    }

    const { error: deleteError } = await supabase
      .from('photo_hunt_submissions')
      .delete()
      .eq('id', submission.id)

    setBusy('')

    if (deleteError) {
      console.error('Unable to delete Photo Hunt submission:', deleteError)
      setError('La fiche photo n’a pas pu être supprimée.')
      return
    }

    await loadData()
  }

  const featurePhotoHunt = async () => {
    await updateSettings({
      photosVisible: true,
      featuredModule: 'photos' as PartyModule,
    })
  }

  const exportChallengesCsv = () => {
    const quote = (value: string | number | boolean | null) => {
      const text = value === null ? '' : String(value)
      return `"${text.replaceAll('"', '""')}"`
    }

    const csv = [
      ['id', 'prompt', 'hint', 'sort_order', 'is_active'].join(','),
      ...challenges.map((challenge) => [
        quote(challenge.id),
        quote(challenge.prompt),
        quote(challenge.hint),
        quote(challenge.sort_order),
        quote(challenge.is_active),
      ].join(',')),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'anniv-2026-photo-hunt-defis.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return <main className="photo-hunt-admin photo-hunt-admin--loading">Chargement Photo Hunt…</main>
  }

  return (
    <main className="photo-hunt-admin">
      <header className="photo-hunt-admin__hero">
        <Link to="/admin" className="back-link">← Control Room</Link>
        <p>Anniv 2026 / photos</p>
        <h1>Photo <span>Hunt</span></h1>
        <div className="photo-hunt-admin__hero-actions">
          <Link to="/photos" target="_blank" rel="noreferrer">Voir public ↗</Link>
          <button type="button" onClick={() => void featurePhotoHunt()}>
            {String(settings.featuredModule) === 'photos' ? 'À la une ✓' : 'Mettre à la une'}
          </button>
        </div>
      </header>

      <section className="photo-hunt-admin__metrics">
        <div><strong>{pendingCount}</strong><span>à valider</span></div>
        <div><strong>{approvedCount}</strong><span>publiées</span></div>
        <div><strong>{rejectedCount}</strong><span>refusées</span></div>
        <div><strong>{activeCount}</strong><span>défis actifs</span></div>
      </section>

      {error && <div className="photo-hunt-admin__error">{error}</div>}

      <section className="photo-hunt-admin__panel">
        <div className="photo-hunt-admin__panel-heading">
          <div>
            <p>01 · Régie photo</p>
            <h2>Photos reçues</h2>
          </div>
          <div className="photo-hunt-admin__filters">
            {(['pending', 'approved', 'rejected', 'all'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={filter === value ? 'photo-hunt-admin__filter photo-hunt-admin__filter--active' : 'photo-hunt-admin__filter'}
                onClick={() => setFilter(value)}
              >
                {value === 'pending' ? 'À valider' : value === 'approved' ? 'Publiées' : value === 'rejected' ? 'Refusées' : 'Toutes'}
              </button>
            ))}
          </div>
        </div>

        {visibleSubmissions.length === 0 ? (
          <div className="photo-hunt-admin__empty">
            <strong>Aucune photo dans cette vue</strong>
            <p>Les nouveaux envois apparaîtront ici en direct.</p>
          </div>
        ) : (
          <div className="photo-hunt-admin__moderation-grid">
            {visibleSubmissions.map((submission) => (
              <article key={submission.id} className={`photo-hunt-admin__submission photo-hunt-admin__submission--${submission.status}`}>
                <PhotoHuntImage
                  path={submission.storage_path}
                  alt={`Photo envoyée par ${submission.player_name}`}
                  className="photo-hunt-admin__submission-image"
                />
                <div className="photo-hunt-admin__submission-copy">
                  <div className="photo-hunt-admin__submission-meta">
                    <span>{submission.player_name}</span>
                    <b>{submission.status === 'pending' ? 'À valider' : submission.status === 'approved' ? 'Publiée' : 'Refusée'}</b>
                  </div>
                  <strong>{challengeById.get(submission.challenge_id)?.prompt ?? 'Défi supprimé'}</strong>
                  {submission.caption && <p>{submission.caption}</p>}
                  <small>{new Date(submission.created_at).toLocaleString('fr-FR')}</small>
                </div>

                <div className="photo-hunt-admin__submission-actions">
                  {submission.status !== 'approved' && (
                    <button
                      type="button"
                      className="photo-hunt-admin__approve"
                      disabled={Boolean(busy)}
                      onClick={() => void moderate(submission, 'approved')}
                    >
                      ✓ Publier
                    </button>
                  )}
                  {submission.status !== 'rejected' && (
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => void moderate(submission, 'rejected')}
                    >
                      Refuser
                    </button>
                  )}
                  <button
                    type="button"
                    className="photo-hunt-admin__delete"
                    disabled={Boolean(busy)}
                    onClick={() => void deleteSubmission(submission)}
                  >
                    Supprimer
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="photo-hunt-admin__panel">
        <div className="photo-hunt-admin__panel-heading">
          <div>
            <p>02 · Contenu</p>
            <h2>Défis photo</h2>
          </div>
          <button type="button" className="photo-hunt-admin__csv" onClick={exportChallengesCsv}>CSV ↓</button>
        </div>

        <div className="photo-hunt-admin__new-challenge">
          <textarea
            value={draft.prompt}
            maxLength={240}
            placeholder="Nouveau défi photo…"
            onChange={(event) => setDraft((current) => ({ ...current, prompt: event.target.value }))}
          />
          <input
            value={draft.hint}
            maxLength={240}
            placeholder="Indice / précision optionnelle"
            onChange={(event) => setDraft((current) => ({ ...current, hint: event.target.value }))}
          />
          <button type="button" disabled={!draft.prompt.trim() || Boolean(busy)} onClick={() => void createChallenge()}>
            Ajouter le défi
          </button>
        </div>

        <div className="photo-hunt-admin__challenge-list">
          {challenges.map((challenge, index) => (
            <article key={challenge.id} className={challenge.is_active ? 'photo-hunt-admin__challenge' : 'photo-hunt-admin__challenge photo-hunt-admin__challenge--inactive'}>
              <span className="photo-hunt-admin__challenge-index">{String(index + 1).padStart(2, '0')}</span>

              {editingId === challenge.id ? (
                <div className="photo-hunt-admin__challenge-edit">
                  <textarea
                    value={editDraft.prompt}
                    maxLength={240}
                    onChange={(event) => setEditDraft((current) => ({ ...current, prompt: event.target.value }))}
                  />
                  <input
                    value={editDraft.hint}
                    maxLength={240}
                    placeholder="Indice optionnel"
                    onChange={(event) => setEditDraft((current) => ({ ...current, hint: event.target.value }))}
                  />
                </div>
              ) : (
                <div className="photo-hunt-admin__challenge-copy">
                  <strong>{challenge.prompt}</strong>
                  {challenge.hint && <span>{challenge.hint}</span>}
                </div>
              )}

              <div className="photo-hunt-admin__challenge-actions">
                {editingId === challenge.id ? (
                  <>
                    <button type="button" disabled={Boolean(busy)} onClick={() => void saveEdit(challenge)}>Enregistrer</button>
                    <button type="button" onClick={() => setEditingId(null)}>Annuler</button>
                  </>
                ) : (
                  <button type="button" onClick={() => startEdit(challenge)}>Modifier</button>
                )}
                <button type="button" disabled={Boolean(busy)} onClick={() => void toggleChallenge(challenge)}>
                  {challenge.is_active ? 'Désactiver' : 'Activer'}
                </button>
                <button type="button" className="photo-hunt-admin__delete" disabled={Boolean(busy)} onClick={() => void deleteChallenge(challenge)}>
                  Supprimer
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

export default PhotoHuntAdmin
