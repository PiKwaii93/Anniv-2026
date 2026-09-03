import { Link } from 'react-router-dom'
import { useState } from 'react'

import { useGuests } from '../features/guests/GuestsContext'

function Guests() {
  const [search, setSearch] = useState('')
  const {
    guests,
    loading,
    synchronizationError,
  } = useGuests()

  const confirmedGuests = guests.filter(
    (guest) => guest.status === 'confirmed',
  )

  const totalPresent = confirmedGuests.reduce(
    (total, guest) =>
      total + 1 + guest.plusOnes.length,
    0,
  )

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

      <label className="guest-search">Rechercher un invité<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Son prénom…" /></label>
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
        <section className="public-guests">
          {confirmedGuests.flatMap((guest) => {
            const people = [
              {
                id: guest.id,
                name: guest.name,
                label:
                  guest.plusOnes.length > 0
                    ? `Vient avec ${guest.plusOnes.length} +1`
                    : 'Confirmé',
              },
              ...guest.plusOnes.map((plusOne) => ({
                id: plusOne.id,
                name: plusOne.name,
                label: `+1 de ${guest.name}`,
              })),
            ]

            return people.filter(person => person.name.toLocaleLowerCase('fr').includes(search.trim().toLocaleLowerCase('fr'))).map((person) => (
              <article
                key={person.id}
                className="public-guest-card"
              >
                <div className="guest-avatar">
                  {person.name
                    .charAt(0)
                    .toUpperCase()}
                </div>

                <div>
                  <h2>{person.name}</h2>
                  <p>{person.label}</p>
                </div>
              </article>
            ))
          })}
        </section>
      )}
    </main>
  )
}

export default Guests
