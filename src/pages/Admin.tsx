import {
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import { Link } from 'react-router-dom'

import { useGuests } from '../features/guests/GuestsContext'
import GuestAvatar from '../features/guests/GuestAvatar'
import AvatarCropDialog from '../features/guests/AvatarCropDialog'
import AdminGuestSessions from '../features/identity/AdminGuestSessions'
import AdminPartyDataReset from '../features/identity/AdminPartyDataReset'
import type {
  Guest,
  GuestStatus,
  PlusOne,
} from '../features/guests/types'

import './AdminGuests.css'

const statusLabels: Record<GuestStatus, string> = {
  invited: 'Invité',
  confirmed: 'Confirmé',
  maybe: 'Peut-être',
  declined: 'Ne vient pas',
}

function createPlusOne(): PlusOne {
  return {
    id: crypto.randomUUID(),
    name: '',
    avatarPath: null,
  }
}

function AvatarEditor({
  name,
  path,
  busy,
  compact = false,
  onChange,
}: {
  name: string
  path: string | null
  busy: boolean
  compact?: boolean
  onChange: (file: File | null) => void
}) {
  const [cropFile, setCropFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState('')

  const chooseFile = (file: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFileError('Choisis une image JPG, PNG ou WebP.')
      return
    }

    if (file.size > 20 * 1024 * 1024) {
      setFileError('Choisis une image de moins de 20 Mo.')
      return
    }

    setFileError('')
    setCropFile(file)
  }

  return (
    <>
      <div className={compact ? 'guest-avatar-editor guest-avatar-editor--compact' : 'guest-avatar-editor'}>
        <GuestAvatar name={name} path={path} size={compact ? 'small' : 'large'} />
        <div>
          <label className="guest-avatar-editor__upload">
            <span>{path ? 'Changer' : 'Ajouter une photo'}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) chooseFile(file)
                event.target.value = ''
              }}
            />
          </label>
          {path && (
            <button type="button" disabled={busy} onClick={() => onChange(null)}>
              Retirer
            </button>
          )}
          {busy && <span role="status">Envoi…</span>}
          {fileError && !compact && <span className="guest-avatar-editor__error" role="alert">{fileError}</span>}
        </div>
      </div>
      {cropFile && (
        <AvatarCropDialog
          file={cropFile}
          name={name}
          onCancel={() => setCropFile(null)}
          onConfirm={(croppedFile) => {
            setCropFile(null)
            onChange(croppedFile)
          }}
        />
      )}
    </>
  )
}

function withoutKey<T>(
  record: Record<string, T>,
  key: string,
) {
  const nextRecord = { ...record }
  delete nextRecord[key]
  return nextRecord
}

function Admin() {
  const {
    guests,
    loading,
    synchronizationError,
    addGuest,
    updateGuest,
    removeGuest,
    updateGuestAvatar,
  } = useGuests()

  const [name, setName] = useState('')
  const [status, setStatus] =
    useState<GuestStatus>('invited')
  const [plusOnes, setPlusOnes] = useState<PlusOne[]>([])
  const [notes, setNotes] = useState('')

  const [expandedGuestIds, setExpandedGuestIds] =
    useState<Set<string>>(() => new Set())

  const [nameDrafts, setNameDrafts] =
    useState<Record<string, string>>({})

  const [noteDrafts, setNoteDrafts] =
    useState<Record<string, string>>({})

  const [plusOneNameDrafts, setPlusOneNameDrafts] =
    useState<Record<string, string>>({})

  const [pendingPlusOnes, setPendingPlusOnes] =
    useState<Record<string, PlusOne>>({})

  const [avatarBusy, setAvatarBusy] =
    useState<Record<string, boolean>>({})

  const changeAvatar = async (
    kind: 'guest' | 'plus-one',
    id: string,
    file: File | null,
  ) => {
    const key = `${kind}:${id}`
    setAvatarBusy((current) => ({ ...current, [key]: true }))
    await updateGuestAvatar({ kind, id }, file)
    setAvatarBusy((current) => withoutKey(current, key))
  }

  const stats = useMemo(() => {
    const confirmed = guests.filter(
      (guest) => guest.status === 'confirmed',
    ).length

    const maybe = guests.filter(
      (guest) => guest.status === 'maybe',
    ).length

    const invited = guests.filter(
      (guest) => guest.status === 'invited',
    ).length

    const plusOneCount = guests.reduce(
      (total, guest) => total + guest.plusOnes.length,
      0,
    )

    return {
      confirmed,
      maybe,
      invited,
      plusOnes: plusOneCount,
    }
  }, [guests])

  const toggleGuest = (guestId: string) => {
    setExpandedGuestIds((currentIds) => {
      const nextIds = new Set(currentIds)

      if (nextIds.has(guestId)) {
        nextIds.delete(guestId)
      } else {
        nextIds.add(guestId)
      }

      return nextIds
    })
  }

  const handleAddPlusOne = () => {
    setPlusOnes((currentPlusOnes) => [
      ...currentPlusOnes,
      createPlusOne(),
    ])
  }

  const handleUpdateNewPlusOne = (
    id: string,
    nextName: string,
  ) => {
    setPlusOnes((currentPlusOnes) =>
      currentPlusOnes.map((plusOne) =>
        plusOne.id === id
          ? {
              ...plusOne,
              name: nextName,
            }
          : plusOne,
      ),
    )
  }

  const handleRemoveNewPlusOne = (id: string) => {
    setPlusOnes((currentPlusOnes) =>
      currentPlusOnes.filter(
        (plusOne) => plusOne.id !== id,
      ),
    )
  }

  const handleSubmit = (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()

    const trimmedName = name.trim()

    if (!trimmedName) {
      return
    }

    const cleanedPlusOnes = plusOnes
      .map((plusOne) => ({
        ...plusOne,
        name: plusOne.name.trim(),
      }))
      .filter((plusOne) => plusOne.name.length > 0)

    addGuest({
      name: trimmedName,
      status,
      plusOnes: cleanedPlusOnes,
      notes: notes.trim(),
    })

    setName('')
    setStatus('invited')
    setPlusOnes([])
    setNotes('')
  }

  const commitGuestName = (guest: Guest) => {
    const draft = nameDrafts[guest.id]

    if (draft === undefined) {
      return
    }

    const trimmedName = draft.trim()

    if (
      trimmedName &&
      trimmedName !== guest.name
    ) {
      updateGuest(guest.id, {
        name: trimmedName,
      })
    }

    setNameDrafts((currentDrafts) =>
      withoutKey(currentDrafts, guest.id),
    )
  }

  const commitGuestNotes = (guest: Guest) => {
    const draft = noteDrafts[guest.id]

    if (draft === undefined) {
      return
    }

    const trimmedNotes = draft.trim()

    if (trimmedNotes !== guest.notes) {
      updateGuest(guest.id, {
        notes: trimmedNotes,
      })
    }

    setNoteDrafts((currentDrafts) =>
      withoutKey(currentDrafts, guest.id),
    )
  }

  const getPlusOneDraftKey = (
    guestId: string,
    plusOneId: string,
  ) => `${guestId}:${plusOneId}`

  const commitPlusOneName = (
    guest: Guest,
    plusOne: PlusOne,
  ) => {
    const draftKey = getPlusOneDraftKey(
      guest.id,
      plusOne.id,
    )

    const draft = plusOneNameDrafts[draftKey]

    if (draft === undefined) {
      return
    }

    const trimmedName = draft.trim()

    if (
      trimmedName &&
      trimmedName !== plusOne.name
    ) {
      updateGuest(guest.id, {
        plusOnes: guest.plusOnes.map(
          (currentPlusOne) =>
            currentPlusOne.id === plusOne.id
              ? {
                  ...currentPlusOne,
                  name: trimmedName,
                }
              : currentPlusOne,
        ),
      })
    }

    setPlusOneNameDrafts((currentDrafts) =>
      withoutKey(currentDrafts, draftKey),
    )
  }

  const startPendingPlusOne = (guestId: string) => {
    setExpandedGuestIds((currentIds) => {
      const nextIds = new Set(currentIds)
      nextIds.add(guestId)
      return nextIds
    })

    setPendingPlusOnes((currentPending) => {
      if (currentPending[guestId]) {
        return currentPending
      }

      return {
        ...currentPending,
        [guestId]: createPlusOne(),
      }
    })
  }

  const updatePendingPlusOne = (
    guestId: string,
    nextName: string,
  ) => {
    setPendingPlusOnes((currentPending) => {
      const pendingPlusOne =
        currentPending[guestId]

      if (!pendingPlusOne) {
        return currentPending
      }

      return {
        ...currentPending,
        [guestId]: {
          ...pendingPlusOne,
          name: nextName,
        },
      }
    })
  }

  const cancelPendingPlusOne = (guestId: string) => {
    setPendingPlusOnes((currentPending) =>
      withoutKey(currentPending, guestId),
    )
  }

  const commitPendingPlusOne = (guest: Guest) => {
    const pendingPlusOne =
      pendingPlusOnes[guest.id]

    if (!pendingPlusOne) {
      return
    }

    const trimmedName =
      pendingPlusOne.name.trim()

    if (!trimmedName) {
      return
    }

    updateGuest(guest.id, {
      plusOnes: [
        ...guest.plusOnes,
        {
          ...pendingPlusOne,
          name: trimmedName,
        },
      ],
    })

    cancelPendingPlusOne(guest.id)
  }

  const removeGuestPlusOne = (
    guest: Guest,
    plusOne: PlusOne,
  ) => {
    const shouldDelete = window.confirm(
      `Supprimer ${plusOne.name || 'ce +1'} ?`,
    )

    if (!shouldDelete) {
      return
    }

    updateGuest(guest.id, {
      plusOnes: guest.plusOnes.filter(
        (currentPlusOne) =>
          currentPlusOne.id !== plusOne.id,
      ),
    })

    const draftKey = getPlusOneDraftKey(
      guest.id,
      plusOne.id,
    )

    setPlusOneNameDrafts((currentDrafts) =>
      withoutKey(currentDrafts, draftKey),
    )
  }

  const clearDraftsForGuest = (guestId: string) => {
    setNameDrafts((currentDrafts) =>
      withoutKey(currentDrafts, guestId),
    )

    setNoteDrafts((currentDrafts) =>
      withoutKey(currentDrafts, guestId),
    )

    setPendingPlusOnes((currentPending) =>
      withoutKey(currentPending, guestId),
    )

    setPlusOneNameDrafts((currentDrafts) => {
      const nextDrafts = { ...currentDrafts }

      for (const key of Object.keys(nextDrafts)) {
        if (key.startsWith(`${guestId}:`)) {
          delete nextDrafts[key]
        }
      }

      return nextDrafts
    })
  }

  return (
    <main className="admin-page">
      <header className="page-header">
        <Link to="/admin" className="back-link">
          ← Control Room
        </Link>

        <div>
          <p className="page-eyebrow">
            Anniv 2026 / privé
          </p>

          <h1>Administration</h1>

          <p>
            Gère les invités et prépare la soirée.
          </p>
        </div>
      </header>

      {synchronizationError && (
        <div
          className="guest-sync-error"
          role="alert"
        >
          {synchronizationError}
        </div>
      )}

      <AdminGuestSessions />
      <AdminPartyDataReset />

      <section className="admin-stats">
        <article className="stat-card">
          <span>Total</span>
          <strong>{guests.length}</strong>
        </article>

        <article className="stat-card">
          <span>Confirmés</span>
          <strong>{stats.confirmed}</strong>
        </article>

        <article className="stat-card">
          <span>+1</span>
          <strong>{stats.plusOnes}</strong>
        </article>

        <article className="stat-card">
          <span>En attente</span>
          <strong>
            {stats.invited + stats.maybe}
          </strong>
        </article>
      </section>

      <section className="admin-section">
        <div className="section-heading">
          <div>
            <p className="page-eyebrow">
              Guest list
            </p>

            <h2>Ajouter quelqu&apos;un</h2>
          </div>
        </div>

        <form
          className="guest-form"
          onSubmit={handleSubmit}
        >
          <label>
            Nom

            <input
              type="text"
              autoComplete="off"
              placeholder="Jean Dupont"
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
              required
            />
          </label>

          <label>
            Statut

            <select
              value={status}
              onChange={(event) =>
                setStatus(
                  event.target.value as GuestStatus,
                )
              }
            >
              {Object.entries(statusLabels).map(
                ([value, label]) => (
                  <option
                    key={value}
                    value={value}
                  >
                    {label}
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="guest-form__notes">
            Notes

            <input
              type="text"
              placeholder="Info utile..."
              value={notes}
              onChange={(event) =>
                setNotes(event.target.value)
              }
            />
          </label>

          <div className="plus-one-editor">
            <div className="plus-one-editor__header">
              <span>+1</span>

              <button
                type="button"
                className="secondary-button"
                onClick={handleAddPlusOne}
              >
                + Ajouter un +1
              </button>
            </div>

            {plusOnes.length === 0 ? (
              <p className="plus-one-editor__empty">
                Aucun +1
              </p>
            ) : (
              <div className="plus-one-editor__list">
                {plusOnes.map((plusOne) => (
                  <div
                    key={plusOne.id}
                    className="plus-one-field"
                  >
                    <input
                      type="text"
                      placeholder="Nom du +1"
                      value={plusOne.name}
                      onChange={(event) =>
                        handleUpdateNewPlusOne(
                          plusOne.id,
                          event.target.value,
                        )
                      }
                    />

                    <button
                      type="button"
                      className="icon-delete-button"
                      aria-label="Supprimer le +1"
                      onClick={() =>
                        handleRemoveNewPlusOne(
                          plusOne.id,
                        )
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="submit"
            className="primary-button"
          >
            Ajouter l&apos;invité
          </button>
        </form>
      </section>

      <section className="admin-section">
        <div className="section-heading">
          <div>
            <p className="page-eyebrow">
              Participants
            </p>

            <h2>Liste des invités</h2>
          </div>

          <span className="section-count">
            {guests.length}
          </span>
        </div>

        {loading ? (
          <div className="empty-state">
            <strong>Chargement...</strong>

            <p>
              Synchronisation de la liste des invités.
            </p>
          </div>
        ) : guests.length === 0 ? (
          <div className="empty-state">
            <strong>Aucun invité.</strong>

            <p>
              Ajoute la première personne avec le
              formulaire ci-dessus.
            </p>
          </div>
        ) : (
          <div className="guest-list">
            {guests.map((guest) => {
              const isExpanded = expandedGuestIds.has(
                guest.id,
              )

              const pendingPlusOne =
                pendingPlusOnes[guest.id]

              return (
                <article
                  key={guest.id}
                  className={`guest-row ${
                    isExpanded
                      ? 'guest-row--expanded'
                      : ''
                  }`}
                >
                  <div
                    className="guest-row__identity"
                    onClick={(event) => {
                      const target = event.target as HTMLElement
                      if (target.closest('button, label, a')) return
                      if (isExpanded && target.closest('input')) return
                      toggleGuest(guest.id)
                    }}
                  >
                    <GuestAvatar
                      name={guest.name}
                      path={guest.avatarPath}
                      size="medium"
                      className="guest-avatar"
                    />

                    <div>
                      <input
                        className="guest-name-input"
                        value={
                          nameDrafts[guest.id] ??
                          guest.name
                        }
                        aria-label={`Nom de ${guest.name}`}
                        onChange={(event) =>
                          setNameDrafts(
                            (currentDrafts) => ({
                              ...currentDrafts,
                              [guest.id]:
                                event.target.value,
                            }),
                          )
                        }
                        onBlur={() =>
                          commitGuestName(guest)
                        }
                      />

                      <span className="guest-row__summary">
                        {statusLabels[guest.status]}
                        {guest.plusOnes.length > 0
                          ? ` · ${guest.plusOnes.length} +1`
                          : ''}
                      </span>
                    </div>

                    <button
                      type="button"
                      className="guest-row__toggle"
                      aria-expanded={isExpanded}
                      aria-controls={`guest-details-${guest.id}`}
                      aria-label={
                        isExpanded
                          ? `Replier ${guest.name}`
                          : `Modifier ${guest.name}`
                      }
                      onClick={() =>
                        toggleGuest(guest.id)
                      }
                    >
                      <span>
                        {isExpanded ? '−' : '+'}
                      </span>
                    </button>
                  </div>

                  <div id={`guest-details-${guest.id}`} className="guest-row__content">
                    <AvatarEditor
                      name={guest.name}
                      path={guest.avatarPath}
                      busy={Boolean(avatarBusy[`guest:${guest.id}`])}
                      onChange={(file) => void changeAvatar('guest', guest.id, file)}
                    />

                    <div className="guest-row__controls">
                      <select
                        value={guest.status}
                        aria-label={`Statut de ${guest.name}`}
                        onChange={(event) => {
                          const nextStatus =
                            event.target
                              .value as GuestStatus

                          console.info(
                            '[Guests][STATUS_SELECT]',
                            {
                              guestId: guest.id,
                              previousStatus:
                                guest.status,
                              requestedStatus:
                                nextStatus,
                            },
                          )

                          updateGuest(guest.id, {
                            status: nextStatus,
                          })
                        }}
                      >
                        {Object.entries(
                          statusLabels,
                        ).map(([value, label]) => (
                          <option
                            key={value}
                            value={value}
                          >
                            {label}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() =>
                          startPendingPlusOne(guest.id)
                        }
                      >
                        + Ajouter un +1
                      </button>

                      <button
                        type="button"
                        className="delete-button"
                        onClick={() => {
                          const shouldDelete =
                            window.confirm(
                              `Supprimer ${guest.name} ?`,
                            )

                          if (shouldDelete) {
                            clearDraftsForGuest(guest.id)
                            removeGuest(guest.id)
                          }
                        }}
                      >
                        Supprimer
                      </button>
                    </div>

                    <label className="guest-row__notes-editor">
                      <span>Notes privées</span>

                      <textarea
                        rows={3}
                        placeholder="Info utile pour la soirée..."
                        value={
                          noteDrafts[guest.id] ??
                          guest.notes
                        }
                        onChange={(event) =>
                          setNoteDrafts(
                            (currentDrafts) => ({
                              ...currentDrafts,
                              [guest.id]:
                                event.target.value,
                            }),
                          )
                        }
                        onBlur={() =>
                          commitGuestNotes(guest)
                        }
                      />
                    </label>

                    {(guest.plusOnes.length > 0 ||
                      pendingPlusOne) && (
                      <div className="guest-plus-ones">
                        <span className="guest-plus-ones__title">
                          +1
                        </span>

                        {guest.plusOnes.map(
                          (plusOne) => {
                            const draftKey =
                              getPlusOneDraftKey(
                                guest.id,
                                plusOne.id,
                              )

                            return (
                              <div
                                key={plusOne.id}
                                className="plus-one-field plus-one-field--with-avatar"
                              >
                                <AvatarEditor
                                  compact
                                  name={plusOne.name}
                                  path={plusOne.avatarPath}
                                  busy={Boolean(avatarBusy[`plus-one:${plusOne.id}`])}
                                  onChange={(file) => void changeAvatar('plus-one', plusOne.id, file)}
                                />
                                <input
                                  type="text"
                                  placeholder="Nom du +1"
                                  value={
                                    plusOneNameDrafts[
                                      draftKey
                                    ] ?? plusOne.name
                                  }
                                  onChange={(event) =>
                                    setPlusOneNameDrafts(
                                      (currentDrafts) => ({
                                        ...currentDrafts,
                                        [draftKey]:
                                          event.target.value,
                                      }),
                                    )
                                  }
                                  onBlur={() =>
                                    commitPlusOneName(
                                      guest,
                                      plusOne,
                                    )
                                  }
                                />

                                <button
                                  type="button"
                                  className="icon-delete-button"
                                  aria-label={`Supprimer ${plusOne.name || 'le +1'}`}
                                  onClick={() =>
                                    removeGuestPlusOne(
                                      guest,
                                      plusOne,
                                    )
                                  }
                                >
                                  ×
                                </button>
                              </div>
                            )
                          },
                        )}

                        {pendingPlusOne && (
                          <div className="plus-one-field plus-one-field--pending">
                            <input
                              type="text"
                              autoFocus
                              placeholder="Nom du nouveau +1"
                              value={pendingPlusOne.name}
                              onChange={(event) =>
                                updatePendingPlusOne(
                                  guest.id,
                                  event.target.value,
                                )
                              }
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault()
                                  commitPendingPlusOne(guest)
                                }

                                if (event.key === 'Escape') {
                                  cancelPendingPlusOne(guest.id)
                                }
                              }}
                            />

                            <button
                              type="button"
                              className="icon-confirm-button"
                              aria-label="Valider le +1"
                              disabled={!pendingPlusOne.name.trim()}
                              onClick={() =>
                                commitPendingPlusOne(guest)
                              }
                            >
                              ✓
                            </button>

                            <button
                              type="button"
                              className="icon-delete-button"
                              aria-label="Annuler le +1"
                              onClick={() =>
                                cancelPendingPlusOne(guest.id)
                              }
                            >
                              ×
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}

export default Admin
