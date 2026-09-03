import { useMemo, useState } from 'react'

import {
  type AnnouncementKind,
  useAnnouncement,
} from './AnnouncementContext'

import './DirectorAnnouncementDock.css'

type QuickAnnouncement = {
  label: string
  message: string
  kind: AnnouncementKind
}

const quickAnnouncements: QuickAnnouncement[] = [
  {
    label: '🍕 Pizzas',
    message: '🍕 Les pizzas sont arrivées !',
    kind: 'food',
  },
  {
    label: '📸 Photo',
    message: '📸 Photo de groupe dans 5 minutes !',
    kind: 'photo',
  },
  {
    label: '🍺 Beer Pong',
    message: '🍺 Beer Pong dans 10 minutes !',
    kind: 'game',
  },
  {
    label: '📊 La Salle',
    message: '📊 Tout le monde dans La Salle !',
    kind: 'game',
  },
  {
    label: '🎂 Gâteau',
    message: '🎂 Gâteau dans 5 minutes !',
    kind: 'food',
  },
]

const durationOptions: Array<{
  value: string
  label: string
  seconds: number | null
}> = [
  { value: '15', label: '15 sec.', seconds: 15 },
  { value: '30', label: '30 sec.', seconds: 30 },
  { value: '60', label: '1 min.', seconds: 60 },
  { value: 'persistent', label: 'Jusqu’au retrait', seconds: null },
]

function DirectorAnnouncementDock({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  const {
    announcement,
    visible,
    saving,
    error,
    publish,
    clear,
  } = useAnnouncement()
  const [message, setMessage] = useState('')
  const [kind, setKind] = useState<AnnouncementKind>('info')
  const [duration, setDuration] = useState('15')

  const selectedDuration = useMemo(
    () => durationOptions.find((option) => option.value === duration),
    [duration],
  )

  const selectedDurationSeconds = selectedDuration
    ? selectedDuration.seconds
    : 15

  const broadcast = async () => {
    const ok = await publish({
      message,
      kind,
      durationSeconds: selectedDurationSeconds,
    })

    if (ok) {
      setMessage('')
    }
  }

  const broadcastQuick = async (preset: QuickAnnouncement) => {
    setKind(preset.kind)
    setMessage(preset.message)
    await publish({
      message: preset.message,
      kind: preset.kind,
      durationSeconds: selectedDurationSeconds,
    })
  }

  return (
    <div className="director-announcement-dock">
      <button
        type="button"
        className={visible ? 'director-announcement-launch director-announcement-launch--active' : 'director-announcement-launch'}
        aria-expanded={open}
        aria-controls="regie-announcement-panel"
        onClick={() => setOpen(!open)}
      >
        <span>📣</span>
        <div>
          <small>{visible ? 'Annonce active' : 'Diffusion'}</small>
          <strong>{visible ? 'Gérer l’annonce' : 'Envoyer une annonce'}</strong>
        </div>
      </button>
      {open && (
        <section
          className="director-announcement-panel"
          id="regie-announcement-panel"
          aria-label="Diffuser une annonce live"
        >
          <div className="director-announcement-panel__header">
            <div>
              <small>Diffusion live</small>
              <strong>Annonce à tout le monde</strong>
            </div>
            <button
              type="button"
              aria-label="Fermer le panneau d’annonces"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>

          {visible && (
            <div className="director-announcement-current">
              <div>
                <small>En cours</small>
                <strong>{announcement.message}</strong>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => void clear()}
              >
                Retirer
              </button>
            </div>
          )}

          <div className="director-announcement-quick">
            {quickAnnouncements.map((preset) => (
              <button
                key={preset.label}
                type="button"
                disabled={saving}
                onClick={() => void broadcastQuick(preset)}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <textarea
            aria-label="Message de l’annonce"
            value={message}
            maxLength={240}
            rows={3}
            placeholder="Ex. 🍕 Les pizzas sont arrivées !"
            onChange={(event) => setMessage(event.target.value)}
          />

          <div className="director-announcement-settings">
            <label>
              <span>Style</span>
              <select
                value={kind}
                onChange={(event) =>
                  setKind(event.target.value as AnnouncementKind)
                }
              >
                <option value="info">📣 Annonce</option>
                <option value="food">🍕 Repas</option>
                <option value="photo">📸 Photo</option>
                <option value="game">🎮 Jeu</option>
                <option value="urgent">⚡ Important</option>
              </select>
            </label>

            <label>
              <span>Durée</span>
              <select
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
              >
                {durationOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="director-announcement-footer">
            <span>{message.length}/240</span>
            <button
              type="button"
              className="director-announcement-send"
              disabled={saving || !message.trim()}
              onClick={() => void broadcast()}
            >
              {saving ? 'Diffusion…' : '📣 Diffuser'}
            </button>
          </div>

          {error && (
            <p className="director-announcement-error">
              {error}
            </p>
          )}
        </section>
      )}

    </div>
  )
}

export default DirectorAnnouncementDock
