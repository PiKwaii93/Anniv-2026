import { useState } from 'react'
import { Link } from 'react-router-dom'

import PwaInstallCard from '../pwa/PwaInstallCard'
import { usePartyIdentity } from './PartyIdentityContext'

import './HomeIdentityOnboarding.css'

export default function IosInstallIdentityGate() {
  const {
    identity,
    busy,
    error,
    releaseIdentity,
  } = usePartyIdentity()
  const [releasedName, setReleasedName] = useState('')

  const releaseSafariIdentity = async () => {
    if (!identity || busy) return
    const playerName = identity.playerName
    const released = await releaseIdentity()
    if (released) setReleasedName(playerName)
  }

  return (
    <div className="home-onboarding" role="dialog" aria-modal="true" aria-labelledby="ios-install-title">
      <div className="home-onboarding__glow home-onboarding__glow--one" />
      <div className="home-onboarding__glow home-onboarding__glow--two" />

      <section className="home-onboarding__card home-onboarding__card--ios-install">
        <div className="home-onboarding__brand">
          <span>ANNIV 2026</span>
          <b>APP</b>
        </div>

        <p className="home-onboarding__eyebrow">Avant de rejoindre la soirée</p>
        <h1 id="ios-install-title">Installe Anniv 2026.</h1>
        <p className="home-onboarding__intro">
          Sur iPhone ou iPad, ajoute l’app à ton écran d’accueil avant de choisir ton prénom.
        </p>

        {identity && (
          <div className="home-onboarding__safari-identity">
            <strong>{identity.playerName} est encore lié à Safari.</strong>
            <p>Libère ce prénom ici, puis reprends-le après avoir ouvert l’app depuis son icône.</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void releaseSafariIdentity()}
            >
              {busy ? 'Déconnexion…' : 'Se déconnecter de Safari'}
            </button>
          </div>
        )}

        {releasedName && !identity && (
          <p className="home-onboarding__release-success" role="status">
            {releasedName} est libéré. Tu pourras reprendre ce prénom dans l’app.
          </p>
        )}

        {error && <p className="home-onboarding__error">{error}</p>}

        <PwaInstallCard placement="onboarding" />

        <p className="home-onboarding__privacy">
          Le choix du prénom apparaîtra uniquement dans l’app installée.
        </p>
        <div className="home-onboarding__footer">
          <Link className="home-onboarding__admin" to="/admin/login" state={{ from: '/admin' }}>
            Administration <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </div>
  )
}
