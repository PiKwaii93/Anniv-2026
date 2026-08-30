import {
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  Link,
  useLocation,
} from 'react-router-dom'

import { useAuth } from '../auth/AuthContext'
import {
  isPartyModuleVisible,
  type PartyModule,
  type PartyPhase,
  type PartySettings,
  useParty,
} from './PartyContext'

import './AdminPartyDock.css'
import './AdminDirectorLaunch.css'

const phaseOptions: Array<{
  value: PartyPhase
  label: string
  detail: string
}> = [
  {
    value: 'preparation',
    label: 'Préparation',
    detail: 'Le site est prêt, la soirée n’est pas encore lancée.',
  },
  {
    value: 'live',
    label: 'En cours',
    detail: 'La soirée est en direct.',
  },
  {
    value: 'ended',
    label: 'Terminée',
    detail: 'La soirée est terminée, le site reste consultable.',
  },
]

const moduleOptions: Array<{
  value: PartyModule
  label: string
}> = [
  { value: 'iceberg', label: 'Iceberg' },
  { value: 'beer-pong', label: 'Beer Pong' },
  { value: 'bingo', label: 'Bingo' },
  { value: 'missions', label: 'Missions secrètes' },
  { value: 'room', label: 'La Salle' },
  { value: 'guests', label: 'Invités' },
]

function visibilityPatch(
  module: PartyModule,
  visible: boolean,
): Partial<PartySettings> {
  switch (module) {
    case 'iceberg':
      return { icebergVisible: visible }
    case 'beer-pong':
      return { beerPongVisible: visible }
    case 'bingo':
      return { bingoVisible: visible }
    case 'missions':
      return { missionsVisible: visible }
    case 'room':
      return { roomVisible: visible }
    case 'guests':
      return { guestsVisible: visible }
  }
}

function AdminPartyDock() {
  const location = useLocation()
  const { isAdmin } = useAuth()
  const {
    settings,
    loading,
    saving,
    error,
    updateSettings,
  } = useParty()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  const currentPhase = phaseOptions.find((option) => option.value === settings.phase) ?? phaseOptions[0]
  const visibleModules = useMemo(
    () => moduleOptions.filter((module) => isPartyModuleVisible(settings, module.value)),
    [settings],
  )

  if (!isAdmin || !location.pathname.startsWith('/admin') || location.pathname === '/admin/login') {
    return null
  }

  const toggleModule = async (module: PartyModule) => {
    const currentlyVisible = isPartyModuleVisible(settings, module)
    const patch: Partial<PartySettings> = {
      ...visibilityPatch(module, !currentlyVisible),
    }

    if (currentlyVisible && settings.featuredModule === module) {
      patch.featuredModule = null
    }

    await updateSettings(patch)
  }

  return (
    <>
      <Link
        to="/admin/content"
        className={
          location.pathname === '/admin/content'
            ? 'party-director-launch party-director-launch--content party-director-launch--active'
            : 'party-director-launch party-director-launch--content'
        }
        aria-label="Ouvrir les sauvegardes de contenu"
      >
        <span>⇅</span>
        <strong>Contenu</strong>
        <small>Backup</small>
      </Link>

      <Link
        to="/admin/live"
        className={
          location.pathname === '/admin/live'
            ? 'party-director-launch party-director-launch--active'
            : 'party-director-launch'
        }
        aria-label="Ouvrir le Mode Directeur"
      >
        <span>⌘</span>
        <strong>Directeur</strong>
        <small>Jour J</small>
      </Link>

      <button
        type="button"
        className={`party-dock party-dock--${settings.phase}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="party-dock__dot" />
        <span>Mode soirée</span>
        <strong>{loading ? 'Synchronisation...' : currentPhase.label}</strong>
      </button>

      {open && (
        <div className="party-drawer-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <aside
            className="party-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="party-drawer-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="party-drawer__header">
              <div>
                <p>Anniv 2026 / contrôle</p>
                <h2 id="party-drawer-title">Mode soirée</h2>
              </div>
              <button type="button" aria-label="Fermer" onClick={() => setOpen(false)}>×</button>
            </header>

            {error && <div className="party-drawer__error">{error}</div>}

            <section className="party-drawer__section">
              <div className="party-drawer__section-heading">
                <span>État</span>
                {saving && <small>Sauvegarde...</small>}
              </div>

              <div className="party-phase-options">
                {phaseOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={settings.phase === option.value ? 'party-phase-option party-phase-option--active' : 'party-phase-option'}
                    aria-pressed={settings.phase === option.value}
                    disabled={loading || saving}
                    onClick={() => void updateSettings({ phase: option.value })}
                  >
                    <strong>{option.label}</strong>
                    <span>{option.detail}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="party-drawer__section">
              <div className="party-drawer__section-heading">
                <span>À la une</span>
                <small>Home</small>
              </div>

              <select
                className="party-featured-select"
                value={settings.featuredModule ?? ''}
                disabled={loading || saving}
                onChange={(event) => {
                  const value = event.target.value
                  void updateSettings({
                    featuredModule: value === '' ? null : value as PartyModule,
                  })
                }}
              >
                <option value="">Aucun module mis en avant</option>
                {visibleModules.map((module) => (
                  <option key={module.value} value={module.value}>{module.label}</option>
                ))}
              </select>
            </section>

            <section className="party-drawer__section">
              <div className="party-drawer__section-heading">
                <span>Visibilité publique</span>
                <small>Accès direct inclus</small>
              </div>

              <div className="party-visibility-list">
                {moduleOptions.map((module) => {
                  const visible = isPartyModuleVisible(settings, module.value)
                  return (
                    <button
                      key={module.value}
                      type="button"
                      disabled={loading || saving}
                      className={visible ? 'party-visibility-row party-visibility-row--visible' : 'party-visibility-row'}
                      aria-pressed={visible}
                      onClick={() => void toggleModule(module.value)}
                    >
                      <span>{module.label}</span>
                      <strong>{visible ? 'Visible' : 'Masqué'}</strong>
                      <i aria-hidden="true" />
                    </button>
                  )
                })}
              </div>
            </section>

            <div className="party-drawer__actions">
              <Link to="/admin/live" className="party-drawer__qr-link">
                <span>⌘</span>
                Mode Directeur
              </Link>
              <Link to="/admin/room" className="party-drawer__qr-link">
                <span>◉</span>
                Régie La Salle
              </Link>
              <Link to="/admin/missions" className="party-drawer__qr-link">
                <span>◎</span>
                Gérer les missions
              </Link>
              <Link to="/admin/content" className="party-drawer__qr-link">
                <span>⇅</span>
                Sauvegarder le contenu
              </Link>
              <Link to="/hall-of-fame" className="party-drawer__qr-link">
                <span>★</span>
                Prévisualiser le Hall of Fame
              </Link>
              <Link to="/qr" className="party-drawer__qr-link">
                <span>▦</span>
                Afficher le QR code
              </Link>
              <Link to="/" className="party-drawer__public-link">Voir la Home ↗</Link>
            </div>
          </aside>
        </div>
      )}
    </>
  )
}

export default AdminPartyDock
