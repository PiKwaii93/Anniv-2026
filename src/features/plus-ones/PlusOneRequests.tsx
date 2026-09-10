import { useMemo, useRef, useState, type FormEvent } from 'react'

import GuestAvatar from '../guests/GuestAvatar'
import { useGuests } from '../guests/GuestsContext'
import { usePartyIdentity } from '../identity/PartyIdentityContext'
import { usePlusOneRequests, type PlusOneRequest } from './usePlusOneRequests'

import './plusOneRequests.css'

const requestStatus: Record<PlusOneRequest['status'], string> = {
  pending: 'En attente',
  approved: 'Accepté',
  rejected: 'Refusé',
}

export function GuestPlusOneRequests() {
  const { identity } = usePartyIdentity()
  const { requests, loading, busy, error, act } = usePlusOneRequests()
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [success, setSuccess] = useState('')
  const requestId = useRef(crypto.randomUUID())
  const pending = requests.find((request) => request.status === 'pending')
  const canRequest = Boolean(identity?.playerKey.startsWith('guest:'))

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const requestedName = name.trim()
    if (!requestedName) return
    setSuccess('')

    const ok = await act('submit', {
      request_id: requestId.current,
      requested_name: requestedName,
      note: note.trim(),
    })
    if (!ok) return

    requestId.current = crypto.randomUUID()
    setName('')
    setNote('')
    setSuccess('Ta demande a bien été envoyée.')
  }

  const cancel = async (request: PlusOneRequest) => {
    setSuccess('')
    const ok = await act('cancel', { request_id: request.id })
    if (ok) setSuccess('Ta demande a été annulée.')
  }

  return (
    <section className="plus-one-request plus-one-request--guest">
      <div className="plus-one-request__intro">
        <span className="plus-one-request__icon" aria-hidden="true">＋</span>
        <div>
          <p className="page-eyebrow">Invitation</p>
          <h2>Tu veux venir accompagné ?</h2>
          <p>Envoie le prénom de ton +1. Maxence validera la demande avant son ajout à la liste.</p>
        </div>
      </div>

      {!canRequest ? (
        <p className="plus-one-request__notice">Choisis ton profil principal depuis le menu pour envoyer une demande.</p>
      ) : loading ? (
        <p className="plus-one-request__notice">Chargement des demandes…</p>
      ) : pending ? (
        <article className="plus-one-request__current">
          <div>
            <span>Demande en attente</span>
            <strong>{pending.requestedName}</strong>
            {pending.note && <p>{pending.note}</p>}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void cancel(pending)}
          >
            Annuler
          </button>
        </article>
      ) : (
        <form className="plus-one-request__form" onSubmit={submit}>
          <label>
            Prénom de ton +1
            <input
              type="text"
              value={name}
              maxLength={80}
              autoComplete="off"
              placeholder="Son prénom"
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <label>
            Un mot pour l’organisateur <span>(facultatif)</span>
            <textarea
              value={note}
              maxLength={300}
              placeholder="Une information utile…"
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <button type="submit" disabled={busy || !name.trim()}>
            {busy ? 'Envoi…' : 'Envoyer la demande'}
          </button>
        </form>
      )}

      {success && <p className="plus-one-request__feedback plus-one-request__feedback--success" role="status">{success}</p>}
      {error && <p className="plus-one-request__feedback plus-one-request__feedback--error" role="alert">{error}</p>}

      {requests.some((request) => request.status !== 'pending') && (
        <details className="plus-one-request__history">
          <summary>Voir les demandes précédentes</summary>
          <div>
            {requests.filter((request) => request.status !== 'pending').map((request) => (
              <p key={request.id}>
                <strong>{request.requestedName}</strong>
                <span className={`plus-one-request__status plus-one-request__status--${request.status}`}>
                  {requestStatus[request.status]}
                </span>
              </p>
            ))}
          </div>
        </details>
      )}
    </section>
  )
}

export function AdminPlusOneRequests() {
  const { guests } = useGuests()
  const { requests, loading, busy, error, act } = usePlusOneRequests(true)
  const [success, setSuccess] = useState('')
  const pending = requests.filter((request) => request.status === 'pending')
  const history = requests.filter((request) => request.status !== 'pending')
  const guestById = useMemo(
    () => new Map(guests.map((guest) => [guest.id, guest])),
    [guests],
  )

  const review = async (request: PlusOneRequest, approve: boolean) => {
    setSuccess('')
    const ok = await act(
      approve ? 'admin_approve' : 'admin_reject',
      { request_id: request.id },
    )
    if (ok) {
      setSuccess(
        approve
          ? `${request.requestedName} a été ajouté à la liste.`
          : `La demande pour ${request.requestedName} a été refusée.`,
      )
    }
  }

  return (
    <section className="admin-section plus-one-request plus-one-request--admin">
      <div className="section-heading plus-one-request__admin-heading">
        <div>
          <p className="page-eyebrow">Invitations</p>
          <h2>Demandes de +1</h2>
          <p>Accepte une demande pour ajouter automatiquement la personne à la guest list.</p>
        </div>
        <span className="plus-one-request__count">{pending.length} en attente</span>
      </div>

      {loading ? (
        <p className="plus-one-request__empty">Chargement des demandes…</p>
      ) : pending.length === 0 ? (
        <p className="plus-one-request__empty">Aucune demande à traiter.</p>
      ) : (
        <div className="plus-one-request__queue">
          {pending.map((request) => {
            const guest = guestById.get(request.guestId)
            return (
              <article key={request.id} className="plus-one-request__card">
                <div className="plus-one-request__requester">
                  <GuestAvatar name={request.guestName} path={guest?.avatarPath ?? null} size="small" />
                  <div>
                    <span>Demandé par {request.guestName}</span>
                    <strong>{request.requestedName}</strong>
                  </div>
                </div>
                {request.note && <p>“{request.note}”</p>}
                <small>{new Date(request.createdAt).toLocaleString('fr-FR')}</small>
                <div className="plus-one-request__actions">
                  <button type="button" disabled={busy} onClick={() => void review(request, true)}>Accepter</button>
                  <button type="button" disabled={busy} onClick={() => void review(request, false)}>Refuser</button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {success && <p className="plus-one-request__feedback plus-one-request__feedback--success" role="status">{success}</p>}
      {error && <p className="plus-one-request__feedback plus-one-request__feedback--error" role="alert">{error}</p>}

      {history.length > 0 && (
        <details className="plus-one-request__history plus-one-request__history--admin">
          <summary>Historique ({history.length})</summary>
          <div>
            {history.map((request) => (
              <p key={request.id}>
                <span>{request.guestName} · <strong>{request.requestedName}</strong></span>
                <span className={`plus-one-request__status plus-one-request__status--${request.status}`}>
                  {requestStatus[request.status]}
                </span>
              </p>
            ))}
          </div>
        </details>
      )}
    </section>
  )
}
