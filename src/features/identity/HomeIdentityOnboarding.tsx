import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { useAuth } from '../auth/AuthContext'
import { usePartyIdentity } from './PartyIdentityContext'

import './HomeIdentityOnboarding.css'

function HomeIdentityOnboarding() {
  const { isAdmin } = useAuth()
  const {
    identity,
    availablePlayers,
    loading,
    busy,
    error,
    migrationConflict,
    claimIdentity,
  } = usePartyIdentity()

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState('')
  const [welcoming, setWelcoming] = useState(false)
  const welcomeTimer = useRef<number | null>(null)

  const matches = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('fr')

    return availablePlayers
      .filter((player) => {
        if (!query) return true

        return `${player.name} ${player.detail}`
          .toLocaleLowerCase('fr')
          .includes(query)
      })
      .slice(0, 24)
  }, [availablePlayers, search])

  useEffect(() => () => {
    if (welcomeTimer.current !== null) {
      window.clearTimeout(welcomeTimer.current)
    }
  }, [])

  if (isAdmin) return null

  if (loading) {
    return (
      <div className="home-onboarding home-onboarding--loading">
        <div className="home-onboarding__loader">◌</div>
        <strong>On prépare ton profil…</strong>
      </div>
    )
  }

  if (identity && !welcoming) return null

  const confirmIdentity = async () => {
    if (!selected || busy) return

    const ok = await claimIdentity(selected)
    if (!ok) return

    setWelcoming(true)
    welcomeTimer.current = window.setTimeout(() => {
      setWelcoming(false)
    }, 150)
  }

  if (welcoming && identity) {
    return (
      <div className="home-onboarding home-onboarding--welcome">
        <div className="home-onboarding__welcome-mark">✓</div>
        <p>Profil prêt</p>
        <h1>Bienvenue {identity.playerName}</h1>
        <span>Ta soirée commence ici.</span>
      </div>
    )
  }

  return (
    <div className="home-onboarding" role="dialog" aria-modal="true" aria-labelledby="home-onboarding-title">
      <div className="home-onboarding__glow home-onboarding__glow--one" />
      <div className="home-onboarding__glow home-onboarding__glow--two" />

      <section className="home-onboarding__card">
        <div className="home-onboarding__brand">
          <span>ANNIV 2026</span>
          <b>01</b>
        </div>

        <p className="home-onboarding__eyebrow">Première étape</p>
        <h1 id="home-onboarding-title">
          Choisis ton prénom.
        </h1>
        <p className="home-onboarding__intro">
          Une seule fois, et ce téléphone te reconnaîtra pour la soirée.
        </p>

        {migrationConflict && (
          <div className="home-onboarding__notice">
            Deux anciens profils ont été trouvés sur ce téléphone. Choisis celui que tu veux garder.
          </div>
        )}

        <label className="home-onboarding__search">
          <span>Ton prénom</span>
          <input
            value={search}
            autoComplete="off"
            placeholder="Tape ton prénom…"
            onChange={(event) => {
              setSearch(event.target.value)
              setSelected('')
            }}
          />
        </label>

        <div className="home-onboarding__people" aria-label="Participants disponibles">
          {matches.map((player) => (
            <button
              key={player.key}
              type="button"
              disabled={busy}
              className={
                selected === player.key
                  ? 'home-onboarding__person home-onboarding__person--selected'
                  : 'home-onboarding__person'
              }
              onClick={() => setSelected(player.key)}
            >
              <span>{player.name.slice(0, 1).toUpperCase()}</span>
              <div>
                <strong>{player.name}</strong>
                <small>{player.detail}</small>
              </div>
              <b>{selected === player.key ? '✓' : '→'}</b>
            </button>
          ))}
        </div>

        {matches.length === 0 && (
          <p className="home-onboarding__empty">
            Aucun prénom trouvé. Essaie sans accent ou demande à Maxence de vérifier ton inscription.
          </p>
        )}

        {error && (
          <p className="home-onboarding__error">{error}</p>
        )}

        <button
          type="button"
          className="home-onboarding__confirm"
          disabled={!selected || busy}
          onClick={() => void confirmIdentity()}
        >
          {busy ? 'Connexion…' : selected ? 'C’est moi →' : 'Choisis ton prénom'}
        </button>

        <p className="home-onboarding__privacy">
          Pas de compte à créer · ton choix reste lié à ce téléphone.
        </p>
      </section>
    </div>
  )
}

export default HomeIdentityOnboarding
