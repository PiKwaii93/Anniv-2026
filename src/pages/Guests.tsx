import { Link } from 'react-router-dom'
import { useMemo, useState } from 'react'

import { useGuests } from '../features/guests/GuestsContext'
import GuestAvatar from '../features/guests/GuestAvatar'
import { GuestPlusOneRequests } from '../features/plus-ones/PlusOneRequests'

function Guests() {
  const [search, setSearch] = useState('')
  const {
    guests,
    loading,
    synchronizationError,
  } = useGuests()

  const confirmedGuests = useMemo(
    () => guests.filter((guest) => guest.status === 'confirmed'),
    [guests],
  )

  const totalPresent = confirmedGuests.reduce(
    (total, guest) =>
      total + 1 + guest.plusOnes.length,
    0,
  )

  const people = useMemo(
    () =>
      confirmedGuests.flatMap((guest) => [
        {
          id: guest.id,
          name: guest.name,
          avatarPath: guest.avatarPath,
          label:
            guest.plusOnes.length > 0
              ? `Vient avec ${guest.plusOnes.length} +1`
              : 'Confirmé',
        },
        ...guest.plusOnes.map((plusOne) => ({
          id: plusOne.id,
          name: plusOne.name,
          avatarPath: plusOne.avatarPath,
          label: `+1 de ${guest.name}`,
        })),
      ]),
    [confirmedGuests],
  )

  const normalizedSearch = search.trim().toLocaleLowerCase('fr')
  const visiblePeople = normalizedSearch
    ? people.filter((person) =>
        person.name.toLocaleLowerCase('fr').includes(normalizedSearch),
      )
    : people

  return (
    <main className="guests-page">
      <header className="page-header">
        <Link to="/" className="back-link">
          ← Accueil
        </Link>

        <div>
          <p className="page-eyebrow">
            Anniv 2026
          </p>

          <h1>Les invités</h1>

          <p>
            {loading
              ? 'Synchronisation de la guest list...'
              : totalPresent === 0
                ? 'La guest list arrive bientôt.'
                : `${totalPresent} personne${
                    totalPresent > 1 ? 's' : ''
                  } confirmée${
                    totalPresent > 1 ? 's' : ''
                  } pour la soirée.`}
          </p>
        </div>
      </header>

      <GuestPlusOneRequests />

      {!loading && confirmedGuests.length > 0 && (
        <div className="guest-directory-tools">
          <label className="guest-search">
            <span>Rechercher dans la liste</span>
            <span className="guest-search__field">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Un prénom…"
                autoComplete="off"
              />
            </span>
          </label>

          <p className="guest-directory-count" aria-live="polite">
            {normalizedSearch
              ? `${visiblePeople.length} résultat${visiblePeople.length !== 1 ? 's' : ''}`
              : `${people.length} personne${people.length !== 1 ? 's' : ''}`}
          </p>
        </div>
      )}
      {loading ? (
        <div className="empty-state">
          <strong>Chargement...</strong>

          <p>
            La liste se synchronise avec la soirée.
          </p>
        </div>
      ) : synchronizationError &&
        confirmedGuests.length === 0 ? (
        <div className="empty-state">
          <strong>
            La guest list est momentanément indisponible.
          </strong>

          <p>
            Réessaie dans quelques instants.
          </p>
        </div>
      ) : confirmedGuests.length === 0 ? (
        <div className="empty-state">
          <strong>
            Personne pour l&apos;instant.
          </strong>

          <p>
            Les confirmations apparaîtront ici.
          </p>
        </div>
      ) : (
        visiblePeople.length > 0 ? (
          <section className="public-guests" aria-label="Invités confirmés">
            {visiblePeople.map((person) => (
              <article
                key={person.id}
                className="public-guest-card"
              >
                <GuestAvatar
                  name={person.name}
                  path={person.avatarPath}
                  size="medium"
                  className="guest-avatar"
                />

                <div>
                  <h2>{person.name}</h2>
                  <p>{person.label}</p>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <div className="empty-state guest-search-empty">
            <strong>Aucun prénom trouvé.</strong>
            <p>Essaie une autre recherche.</p>
            <button type="button" onClick={() => setSearch('')}>
              Afficher toute la liste
            </button>
          </div>
        )
      )}
    </main>
  )
}

export default Guests
