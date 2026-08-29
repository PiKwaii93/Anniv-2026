import {
  useState,
} from 'react'
import { Link } from 'react-router-dom'

import './PartyQr.css'

const PARTY_URL =
  'https://anniv-2026-pi.vercel.app/'

function PartyQr() {
  const [copied, setCopied] =
    useState(false)

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(
        PARTY_URL,
      )
      setCopied(true)

      window.setTimeout(
        () => setCopied(false),
        1800,
      )
    } catch (error) {
      console.error(
        'Unable to copy party URL:',
        error,
      )
    }
  }

  return (
    <main className="party-qr-page">
      <div className="party-qr-page__glow" />

      <header className="party-qr-header">
        <Link
          to="/"
          className="back-link party-qr-back"
        >
          ← Accueil
        </Link>

        <p>
          Anniv 2026 / accès
        </p>
      </header>

      <section className="party-qr-card">
        <div className="party-qr-card__copy">
          <span className="party-qr-card__label">
            Scanne & rejoins la soirée
          </span>

          <h1>
            ANNIV
            <span>2026</span>
          </h1>

          <p>
            Iceberg, Beer Pong, Bingo et tout le reste,
            directement depuis ton téléphone.
          </p>
        </div>

        <div className="party-qr-code-shell">
          <img
            src="/anniv-2026-qr.svg"
            alt="QR code vers le site Anniv 2026"
            className="party-qr-code"
          />
        </div>

        <div className="party-qr-url">
          <span>Site officiel</span>
          <strong>
            anniv-2026-pi.vercel.app
          </strong>
        </div>

        <button
          type="button"
          className="party-qr-copy-button"
          onClick={() => {
            void copyLink()
          }}
        >
          {copied
            ? 'Lien copié ✓'
            : 'Copier le lien'}
        </button>
      </section>

      <p className="party-qr-print-note">
        Cette page est pensée pour être affichée sur un écran
        ou imprimée.
      </p>
    </main>
  )
}

export default PartyQr
