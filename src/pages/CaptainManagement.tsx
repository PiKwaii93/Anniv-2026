import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../features/auth/AuthContext'
import GuestAvatar from '../features/guests/GuestAvatar'
import { useGuests } from '../features/guests/GuestsContext'
import { supabase } from '../lib/supabase'

import './CaptainManagement.css'

type Captain = {
  userId: string
  guestId: string
  guestName: string
  email: string | null
  createdAt: string
}

type CaptainInvite = {
  id: string
  guestId: string
  guestName: string
  createdAt: string
  expiresAt: string
}

type CaptainState = {
  captains: Captain[]
  invites: CaptainInvite[]
}

const emptyState: CaptainState = { captains: [], invites: [] }

function managementError(error: { message?: string } | null) {
  const message = error?.message ?? ''
  if (message.includes('CAPTAIN_LIMIT')) return 'Tu peux avoir au maximum quatre capitaines actifs ou invités.'
  if (message.includes('CONFIRMED_GUEST_REQUIRED')) return 'Choisis une personne confirmée dans la liste.'
  if (message.includes('ALREADY_CAPTAIN')) return 'Cette personne est déjà capitaine.'
  if (message.includes('OWNER_REQUIRED')) return 'Seul le propriétaire peut gérer les capitaines.'
  return 'L’opération n’a pas pu être enregistrée.'
}

export default function CaptainManagement() {
  const { isOwner } = useAuth()
  const { guests } = useGuests()
  const [state, setState] = useState<CaptainState>(emptyState)
  const [selectedGuestId, setSelectedGuestId] = useState('')
  const [latestLink, setLatestLink] = useState('')
  const [latestName, setLatestName] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyGuestId, setBusyGuestId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    if (!isOwner) return
    const { data, error: loadError } = await supabase.rpc('admin_list_party_captains')
    if (loadError) {
      setError(managementError(loadError))
    } else {
      setState((data ?? emptyState) as CaptainState)
      setError('')
    }
    setLoading(false)
  }, [isOwner])

  useEffect(() => { void load() }, [load])

  const occupiedIds = useMemo(
    () => new Set([
      ...state.captains.map(captain => captain.guestId),
      ...state.invites.map(invite => invite.guestId),
    ]),
    [state],
  )

  const candidates = useMemo(
    () => guests.filter(guest => guest.status === 'confirmed' && !occupiedIds.has(guest.id)),
    [guests, occupiedIds],
  )

  const createInvite = async (guestId: string) => {
    const token = crypto.randomUUID()
    setBusyGuestId(guestId)
    setError('')
    setNotice('')

    const { data, error: createError } = await supabase.rpc(
      'admin_create_party_captain_invite',
      { p_guest_id: guestId, p_token: token },
    )

    if (createError) {
      setError(managementError(createError))
      setBusyGuestId('')
      return
    }

    const result = data as { guestName?: string }
    const link = `${window.location.origin}/captain?token=${encodeURIComponent(token)}`
    setLatestLink(link)
    setLatestName(result.guestName ?? guests.find(guest => guest.id === guestId)?.name ?? 'ce capitaine')
    setSelectedGuestId('')
    setNotice('Lien créé. Envoie-le uniquement à la personne choisie.')
    setBusyGuestId('')
    await load()
  }

  const revoke = async (guestId: string, name: string) => {
    if (!window.confirm(`Retirer l’accès capitaine de ${name} ?`)) return
    setBusyGuestId(guestId)
    setError('')
    const { error: revokeError } = await supabase.rpc(
      'admin_revoke_party_captain',
      { p_guest_id: guestId },
    )
    if (revokeError) setError(managementError(revokeError))
    else {
      setNotice(`L’accès de ${name} a été retiré.`)
      if (latestName === name) {
        setLatestLink('')
        setLatestName('')
      }
      await load()
    }
    setBusyGuestId('')
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(latestLink)
      setNotice(`Lien de ${latestName} copié.`)
    } catch {
      setNotice('Sélectionne puis copie le lien ci-dessous.')
    }
  }

  if (!isOwner) {
    return (
      <main className="captain-management captain-management--denied">
        <Link to="/admin" className="back-link">← Administration</Link>
        <p className="captain-management__eyebrow">Accès propriétaire</p>
        <h1>Gestion des capitaines</h1>
        <p>Ton rôle de capitaine permet de gérer la soirée, mais pas d’attribuer d’autres accès.</p>
      </main>
    )
  }

  return (
    <main className="captain-management">
      <header className="captain-management__hero">
        <Link to="/admin" className="back-link">← Control Room</Link>
        <p className="captain-management__eyebrow">Anniv 2026 / équipe</p>
        <h1>Capitaines <span>de soirée.</span></h1>
        <p>Jusqu’à quatre personnes peuvent piloter les modules depuis leur propre téléphone.</p>
      </header>

      {error && <div className="captain-management__notice captain-management__notice--error" role="alert">{error}</div>}
      {notice && <div className="captain-management__notice" role="status">{notice}</div>}

      <section className="captain-management__create" aria-labelledby="captain-create-title">
        <div>
          <p className="captain-management__eyebrow">Nouvel accès</p>
          <h2 id="captain-create-title">Choisir un invité confirmé</h2>
          <p>La personne créera son compte depuis le lien personnel.</p>
        </div>
        <div className="captain-management__create-row">
          <label>
            Invité
            <select value={selectedGuestId} onChange={event => setSelectedGuestId(event.target.value)} disabled={loading || state.captains.length + state.invites.length >= 4}>
              <option value="">Choisir une personne</option>
              {candidates.map(guest => <option key={guest.id} value={guest.id}>{guest.name}</option>)}
            </select>
          </label>
          <button type="button" disabled={!selectedGuestId || Boolean(busyGuestId)} onClick={() => void createInvite(selectedGuestId)}>
            {busyGuestId === selectedGuestId ? 'Création…' : 'Créer son invitation'}
          </button>
        </div>
        <small>{state.captains.length + state.invites.length}/4 places attribuées ou réservées</small>
      </section>

      {latestLink && (
        <section className="captain-management__link" aria-labelledby="captain-link-title">
          <div>
            <p className="captain-management__eyebrow">Lien personnel</p>
            <h2 id="captain-link-title">Invitation de {latestName}</h2>
          </div>
          <input readOnly value={latestLink} onFocus={event => event.currentTarget.select()} aria-label={`Lien d’invitation de ${latestName}`} />
          <button type="button" onClick={() => void copyLink()}>Copier le lien</button>
          <p>Valable 14 jours. Une nouvelle invitation remplacera celle-ci.</p>
        </section>
      )}

      <section className="captain-management__list" aria-labelledby="captain-list-title">
        <div className="captain-management__heading">
          <div>
            <p className="captain-management__eyebrow">Équipe actuelle</p>
            <h2 id="captain-list-title">Accès attribués</h2>
          </div>
          <strong>{state.captains.length}/4</strong>
        </div>

        {loading ? <p>Chargement des accès…</p> : state.captains.length === 0 && state.invites.length === 0 ? (
          <div className="captain-management__empty">Aucun capitaine pour le moment.</div>
        ) : (
          <div className="captain-management__cards">
            {state.captains.map(captain => {
              const guest = guests.find(item => item.id === captain.guestId)
              return (
                <article key={captain.userId} className="captain-management__card">
                  <GuestAvatar name={captain.guestName} path={guest?.avatarPath ?? null} size="small" />
                  <div><strong>{captain.guestName}</strong><span>Capitaine actif</span>{captain.email && <small>{captain.email}</small>}</div>
                  <button type="button" disabled={busyGuestId === captain.guestId} onClick={() => void revoke(captain.guestId, captain.guestName)}>Retirer</button>
                </article>
              )
            })}
            {state.invites.map(invite => {
              const guest = guests.find(item => item.id === invite.guestId)
              return (
                <article key={invite.id} className="captain-management__card captain-management__card--pending">
                  <GuestAvatar name={invite.guestName} path={guest?.avatarPath ?? null} size="small" />
                  <div><strong>{invite.guestName}</strong><span>Invitation en attente</span><small>Expire le {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(invite.expiresAt))}</small></div>
                  <div className="captain-management__card-actions">
                    <button type="button" disabled={Boolean(busyGuestId)} onClick={() => void createInvite(invite.guestId)}>
                      {busyGuestId === invite.guestId ? 'Création…' : 'Nouveau lien'}
                    </button>
                    <button type="button" disabled={busyGuestId === invite.guestId} onClick={() => void revoke(invite.guestId, invite.guestName)}>Annuler</button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <aside className="captain-management__permissions">
        <span aria-hidden="true">✓</span>
        <div><strong>Ce que les capitaines peuvent faire</strong><p>Piloter le direct, les jeux, les invités, les photos, le chat et les modules. Ils ne peuvent pas gérer les rôles, supprimer un invité, changer d’environnement ni effacer toutes les données.</p></div>
      </aside>
    </main>
  )
}
