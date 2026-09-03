import { useMemo, useState } from 'react'

import {
  useAnnouncement,
} from '../announcements/AnnouncementContext'
import { supabase } from '../../lib/supabase'
import { useParty } from './PartyContext'

import './DirectorScenesDock.css'

type SceneKey =
  | 'welcome'
  | 'room'
  | 'beer-pong'
  | 'photo-time'
  | 'cake'
  | 'closing'

type SceneResult = {
  ok: boolean
  code?: string
  message?: string
  scene?: SceneKey
}

type SceneDefinition = {
  key: SceneKey
  icon: string
  label: string
  kicker: string
  effect: string
  confirm?: string
}

const scenes: SceneDefinition[] = [
  {
    key: 'welcome',
    icon: '✦',
    label: 'Accueil',
    kicker: 'Avant les jeux',
    effect: 'Préparation · aucun module à la une · retire l’annonce en cours',
  },
  {
    key: 'room',
    icon: '◉',
    label: 'La Salle',
    kicker: 'Vote collectif',
    effect: 'Démarre la soirée · La Salle à la une · annonce 20 sec.',
  },
  {
    key: 'beer-pong',
    icon: '◌',
    label: 'Beer Pong',
    kicker: 'Tournoi',
    effect: 'Démarre la soirée · Beer Pong à la une · annonce 20 sec.',
  },
  {
    key: 'photo-time',
    icon: '▧',
    label: 'Photo Time',
    kicker: 'Mur collectif',
    effect: 'Démarre la soirée · Photo Hunt à la une · annonce 30 sec.',
  },
  {
    key: 'cake',
    icon: '◇',
    label: 'Gâteau',
    kicker: 'Interruption',
    effect: 'Retire le module à la une · annonce gâteau pendant 1 min.',
    confirm: 'Lancer la scène Gâteau ? Elle interrompt le module actuellement à la une et diffuse une annonce pendant 1 minute.',
  },
  {
    key: 'closing',
    icon: '★',
    label: 'Fin de soirée',
    kicker: 'Clôture',
    effect: 'Passe la soirée sur Terminée · ouvre le Hall of Fame sur la TV.',
    confirm: 'Terminer la soirée ? /screen basculera sur le Hall of Fame et les modules publics seront considérés comme terminés.',
  },
]

function DirectorScenesDock({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  const {
    settings,
    refresh: refreshParty,
  } = useParty()
  const {
    refresh: refreshAnnouncement,
  } = useAnnouncement()

  const [busy, setBusy] = useState<SceneKey | null>(null)
  const [error, setError] = useState('')
  const [lastScene, setLastScene] = useState<SceneKey | null>(null)

  const inferredScene = useMemo<SceneKey | null>(() => {
    const featured = String(settings.featuredModule ?? '')

    if (settings.phase === 'ended') return 'closing'
    if (settings.phase === 'preparation' && !featured) return 'welcome'
    if (settings.phase === 'live' && featured === 'room') return 'room'
    if (settings.phase === 'live' && featured === 'beer-pong') return 'beer-pong'
    if (settings.phase === 'live' && featured === 'photos') return 'photo-time'
    return lastScene === 'cake' ? 'cake' : null
  }, [lastScene, settings.featuredModule, settings.phase])

  const activeDefinition = scenes.find((scene) => scene.key === inferredScene)

  const runScene = async (scene: SceneDefinition) => {
    if (busy) return

    const welcomeNeedsConfirmation =
      scene.key === 'welcome' && settings.phase !== 'preparation'

    if (welcomeNeedsConfirmation) {
      const confirmed = window.confirm(
        'Revenir à la scène Accueil ? La soirée repassera en Préparation et le module actuellement à la une sera retiré.',
      )
      if (!confirmed) return
    } else if (scene.confirm && !window.confirm(scene.confirm)) {
      return
    }

    setBusy(scene.key)
    setError('')

    const { data, error: rpcError } = await supabase.rpc(
      'admin_apply_party_scene',
      { p_scene: scene.key },
    )

    if (rpcError) {
      console.error('Unable to apply Director scene:', rpcError)
      setError('La scène n’a pas pu être appliquée. Aucun preset n’a été confirmé.')
      setBusy(null)
      return
    }

    const result = data as SceneResult | null
    if (!result?.ok) {
      setError(
        result?.message
          ? `Scène refusée : ${result.message}`
          : 'La scène a été refusée par le serveur.',
      )
      setBusy(null)
      return
    }

    setLastScene(scene.key)
    await Promise.all([
      refreshParty(),
      refreshAnnouncement(),
    ])
    setBusy(null)
  }

  return (
    <div className="director-scenes-dock">
      <button
        type="button"
        className={open ? 'director-scenes-launch director-scenes-launch--open' : 'director-scenes-launch'}
        aria-expanded={open}
        aria-controls="regie-scenes-panel"
        onClick={() => setOpen(!open)}
      >
        <span>🎬</span>
        <div>
          <small>{activeDefinition ? activeDefinition.label : 'Régie express'}</small>
          <strong>Scènes</strong>
        </div>
      </button>
      {open && (
        <section id="regie-scenes-panel" className="director-scenes-panel" aria-label="Scènes du Mode Directeur">
          <div className="director-scenes-panel__header">
            <div>
              <small>Régie express</small>
              <strong>Scènes</strong>
              <span>Un clic règle la soirée, la TV et l’annonce.</span>
            </div>
            <button
              type="button"
              aria-label="Fermer les scènes"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>

          <div className="director-scenes-grid">
            {scenes.map((scene) => {
              const active = inferredScene === scene.key
              const isBusy = busy === scene.key

              return (
                <button
                  key={scene.key}
                  type="button"
                  className={active ? 'director-scene director-scene--active' : 'director-scene'}
                  disabled={Boolean(busy)}
                  onClick={() => void runScene(scene)}
                >
                  <span className="director-scene__icon">{scene.icon}</span>
                  <span className="director-scene__copy">
                    <small>{scene.kicker}</small>
                    <strong>{scene.label}</strong>
                    <em>{scene.effect}</em>
                  </span>
                  <b>{isBusy ? '…' : active ? 'ACTIF' : 'LANCER'}</b>
                </button>
              )
            })}
          </div>

          {error && <p className="director-scenes-error">{error}</p>}
        </section>
      )}

    </div>
  )
}

export default DirectorScenesDock
