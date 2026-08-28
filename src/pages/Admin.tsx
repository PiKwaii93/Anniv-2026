import {
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import { Link } from 'react-router-dom'

import { useGuests } from '../features/guests/GuestsContext'
import type {
  GuestStatus,
  PlusOne,
} from '../features/guests/types'

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
  }
}

function Admin() {
  const {
    guests,
    addGuest,
    updateGuest,
    removeGuest,
  } = useGuests()

  const [name, setName] = useState('')
  const [status, setStatus] =
    useState<GuestStatus>('invited')
  const [plusOnes, setPlusOnes] = useState<PlusOne[]>([])
  const [notes, setNotes] = useState('')
  const [expandedGuestIds, setExpandedGuestIds] =
    useState<Set<string>>(() => new Set())

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

    const plusOnes = guests.reduce(
      (total, guest) => total + guest.plusOnes.length,
      0,
    )

    return {
      confirmed,
      maybe,
      invited,
      plusOnes,
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
    name: string,
  ) => {
    setPlusOnes((currentPlusOnes) =>
      currentPlusOnes.map((plusOne) =>
        plusOne.id === id
          ? {
              ...plusOne,
              name,
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

  const addPlusOneToGuest = (guestId: string) => {
    const guest = guests.find(
      (currentGuest) => currentGuest.id === guestId,
    )

    if (!guest) {
      return
    }

    updateGuest(guestId, {
      plusOnes: [
        ...guest.plusOnes,
        createPlusOne(),
      ],
    })

    setExpandedGuestIds((currentIds) => {
      const nextIds = new Set(currentIds)
      nextIds.add(guestId)
      return nextIds
    })
  }

  const updateGuestPlusOne = (
    guestId: string,
    plusOneId: string,
    name: string,
  ) => {
    const guest = guests.find(
      (currentGuest) => currentGuest.id === guestId,
    )

    if (!guest) {
      return
    }

    updateGuest(guestId, {
      plusOnes: guest.plusOnes.map((plusOne) =>
        plusOne.id === plusOneId
          ? {
              ...plusOne,
              name,
            }
          : plusOne,
      ),
    })
  }

  const removeGuestPlusOne = (
    guestId: string,
    plusOneId: string,
  ) => {
    const guest = guests.find(
      (currentGuest) => currentGuest.id === guestId,
    )

    if (!guest) {
      return
    }

    updateGuest(guestId, {
      plusOnes: guest.plusOnes.filter(
        (plusOne) => plusOne.id !== plusOneId,
      ),
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
              placeholder="Jean Dupont"
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
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

        {guests.length === 0 ? (
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

              return (
                <article
                  key={guest.id}
                  className={`guest-row ${
                    isExpanded
                      ? 'guest-row--expanded'
                      : ''
                  }`}
                >
                  <div className="guest-row__identity">
                    <div className="guest-avatar">
                      {guest.name
                        .charAt(0)
                        .toUpperCase()}
                    </div>

                    <div>
                      <input
                        className="guest-name-input"
                        value={guest.name}
                        aria-label={`Nom de ${guest.name}`}
                        onChange={(event) =>
                          updateGuest(guest.id, {
                            name: event.target.value,
                          })
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

                  <div className="guest-row__content">
                    {guest.notes && (
                      <p className="guest-row__notes">
                        {guest.notes}
                      </p>
                    )}

                    <div className="guest-row__controls">
                      <select
                        value={guest.status}
                        aria-label={`Statut de ${guest.name}`}
                        onChange={(event) =>
                          updateGuest(guest.id, {
                            status:
                              event.target
                                .value as GuestStatus,
                          })
                        }
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
                          addPlusOneToGuest(guest.id)
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
                            removeGuest(guest.id)
                          }
                        }}
                      >
                        Supprimer
                      </button>
                    </div>

                    {guest.plusOnes.length > 0 && (
                      <div className="guest-plus-ones">
                        <span className="guest-plus-ones__title">
                          +1
                        </span>

                        {guest.plusOnes.map(
                          (plusOne) => (
                            <div
                              key={plusOne.id}
                              className="plus-one-field"
                            >
                              <input
                                type="text"
                                placeholder="Nom du +1"
                                value={plusOne.name}
                                onChange={(event) =>
                                  updateGuestPlusOne(
                                    guest.id,
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
                                  removeGuestPlusOne(
                                    guest.id,
                                    plusOne.id,
                                  )
                                }
                              >
                                ×
                              </button>
                            </div>
                          ),
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