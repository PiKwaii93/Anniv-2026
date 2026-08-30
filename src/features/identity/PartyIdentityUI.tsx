import {
  type ReactNode,
  useMemo,
  useState,
} from 'react'
import { Link, useLocation } from 'react-router-dom'

import { usePartyIdentity } from './PartyIdentityContext'

import './PartyIdentity.css'

function IdentityPicker({
  compact = false,
  onPicked,
}: {
  compact?: boolean
  onPicked?: () => void
}) {
  const {
    availablePlayers,
    busy,
    error,
    migrationConflict,
    claimIdentity,
  } = usePartyIdentity()

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState('')

  const matches = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('fr')

    if (!query) {
      return availablePlayers.slice(0, compact ? 10 : 16)
    }

    return availablePlayers
      .filter((player) =>
        `${player.name} ${player.detail}`
          .toLocaleLowerCase('fr')
          .includes(query),
      )
      .slice(0, compact ? 12 : 20)
  }, [availablePlayers, compact, search])

  const confirm = async () => {
    if (!selected) return
    const ok = await claimIdentity(selected)
    if (ok) onPicked?.()
  }

  return (
    <div className={compact ? 'party-identity-picker party-identity-picker--compact' : 'party-identity-picker'}>
      {migrationConflict && (
        <div className="party-identity-picker__notice">
          Deux identités différentes étaient enregistrées sur ce téléphone. Choisis celle que tu veux garder pour toute la soirée.
        </div>
      )}

      <label htmlFor={compact ? 'party-identity-search-compact' : 'party-identity-search'}>
        Ton identité
      </label>
      <input
        id={compact ? 'party-identity-search-compact' : 'party-identity-search'}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Rechercher ton prénom…"
        autoComplete="off"
      />

      <div className="party-identity-picker__people">
        {matches.map((player) => (
          <button
            key={player.key}
            type="button"
            disabled={busy}
            className={
              selected === player.key
                ? 'party-identity-picker__person party-identity-picker__person--selected'
                : 'party-identity-picker__person'
            }
            onClick={() => setSelected(player.key)}
          >
            <strong>{player.name}</strong>
            <span>{player.detail}</span>
          </button>
        ))}
      </div>

      {matches.length === 0 && (
        <p className="party-identity-picker__empty">
          Aucun participant trouvé.
        </p>
      )}

      {error && (
        <p className="party-identity-picker__error">
          {error}
        </p>
      )}

      <button
        type="button"
        className="party-identity-picker__confirm"
        disabled={!selected || busy}
        onClick={() => void confirm()}
      >
        {busy ? 'Connexion…' : 'C’est moi'}
      </button>
    </div>
  )
}

export function PartyIdentityGate({
  children,
}: {
  children: ReactNode
}) {
  const {
    identity,
    loading,
  } = usePartyIdentity()

  if (loading) {
    return (
      <main className="party-identity-gate party-identity-gate--loading">
        <span>◌</span>
        <strong>On retrouve ton identité…</strong>
      </main>
    )
  }

  if (identity) return children

  return (
    <main className="party-identity-gate">
      <div className="party-identity-gate__glow" />
      <Link to="/" className="back-link">← Accueil</Link>

      <section className="party-identity-gate__card">
        <p className="party-identity-gate__eyebrow">
          Anniv 2026 · profil soirée
        </p>
        <h1>Qui es-tu ?</h1>
        <p className="party-identity-gate__intro">
          Choisis ton nom une seule fois. Ce téléphone sera ensuite reconnu automatiquement dans Missions secrètes et La Salle.
        </p>
        <IdentityPicker />
      </section>
    </main>
  )
}

export function PartyIdentityBadge() {
  const location = useLocation()
  const {
    identity,
    loading,
    busy,
    error,
    releaseIdentity,
  } = usePartyIdentity()

  const [open, setOpen] = useState(false)
  const [changing, setChanging] = useState(false)

  const hidden =
    location.pathname.startsWith('/admin') ||
    location.pathname === '/screen' ||
    location.pathname === '/qr' ||
    location.pathname === '/hall-of-fame'

  if (hidden || loading) return null

  const changeIdentity = async () => {
    if (!identity) {
      setChanging(true)
      return
    }

    const confirmed = window.confirm(
      `Changer l’identité de ce téléphone ? ${identity.playerName} restera dans les classements déjà enregistrés, mais ce téléphone ne jouera plus sous ce nom.`,
    )

    if (!confirmed) return

    const ok = await releaseIdentity()
    if (ok) setChanging(true)
  }

  return (
    <div className="party-identity-badge-wrap">
      {open && (
        <section className="party-identity-popover">
          <div className="party-identity-popover__header">
            <div>
              <small>Profil soirée</small>
              <strong>
                {identity && !changing
                  ? `Salut ${identity.playerName}`
                  : 'Qui es-tu ?'}
              </strong>
            </div>
            <button
              type="button"
              aria-label="Fermer"
              onClick={() => {
                setOpen(false)
                setChanging(false)
              }}
            >
              ×
            </button>
          </div>

          {identity && !changing ? (
            <div className="party-identity-popover__current">
              <span className="party-identity-popover__avatar">
                {identity.playerName.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <strong>{identity.playerName}</strong>
                <span>{identity.detail}</span>
                <p>
                  Cette identité est utilisée automatiquement dans les jeux compatibles.
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void changeIdentity()}
              >
                Ce n’est pas moi
              </button>
            </div>
          ) : (
            <IdentityPicker
              compact
              onPicked={() => {
                setChanging(false)
                setOpen(false)
              }}
            />
          )}

          {error && identity && !changing && (
            <p className="party-identity-picker__error">
              {error}
            </p>
          )}
        </section>
      )}

      <button
        type="button"
        className={
          identity
            ? 'party-identity-badge party-identity-badge--known'
            : 'party-identity-badge'
        }
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value)
          if (open) setChanging(false)
        }}
      >
        <span>
          {identity
            ? identity.playerName.slice(0, 1).toUpperCase()
            : '?'}
        </span>
        <div>
          <small>{identity ? 'Ton profil' : 'Première étape'}</small>
          <strong>
            {identity
              ? `Salut ${identity.playerName}`
              : 'Qui es-tu ?'}
          </strong>
        </div>
      </button>
    </div>
  )
}
