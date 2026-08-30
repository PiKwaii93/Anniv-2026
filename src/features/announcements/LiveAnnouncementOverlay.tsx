import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

import {
  type AnnouncementKind,
  useAnnouncement,
} from './AnnouncementContext'

import './LiveAnnouncementOverlay.css'

const kindMeta: Record<
  AnnouncementKind,
  { icon: string; label: string }
> = {
  info: { icon: '📣', label: 'Annonce' },
  food: { icon: '🍕', label: 'À table' },
  photo: { icon: '📸', label: 'Photo' },
  game: { icon: '🎮', label: 'Jeu' },
  urgent: { icon: '⚡', label: 'Attention' },
}

function LiveAnnouncementOverlay() {
  const location = useLocation()
  const {
    announcement,
    visible,
  } = useAnnouncement()
  const [dismissedEventId, setDismissedEventId] =
    useState<string | null>(null)

  const isScreen = location.pathname === '/screen'
  const isAdmin = location.pathname.startsWith('/admin')
  const meta = kindMeta[announcement.kind]

  useEffect(() => {
    if (
      announcement.eventId &&
      announcement.eventId !== dismissedEventId
    ) {
      setDismissedEventId(null)
    }
  }, [announcement.eventId, dismissedEventId])

  if (
    isAdmin ||
    !visible ||
    (!isScreen && dismissedEventId === announcement.eventId)
  ) {
    return null
  }

  if (isScreen) {
    return (
      <aside
        className={`live-announcement live-announcement--screen live-announcement--${announcement.kind}`}
        role={announcement.kind === 'urgent' ? 'alert' : 'status'}
        aria-live={announcement.kind === 'urgent' ? 'assertive' : 'polite'}
      >
        <div className="live-announcement__screen-glow" />
        <div className="live-announcement__screen-card">
          <div className="live-announcement__screen-meta">
            <span>{meta.icon}</span>
            <strong>{meta.label}</strong>
          </div>
          <p>{announcement.message}</p>
          <small>Anniv 2026 · Live</small>
        </div>
      </aside>
    )
  }

  return (
    <aside
      className={`live-announcement live-announcement--phone live-announcement--${announcement.kind}`}
      role={announcement.kind === 'urgent' ? 'alert' : 'status'}
      aria-live={announcement.kind === 'urgent' ? 'assertive' : 'polite'}
    >
      <span className="live-announcement__icon" aria-hidden="true">
        {meta.icon}
      </span>
      <div className="live-announcement__copy">
        <small>{meta.label}</small>
        <strong>{announcement.message}</strong>
      </div>
      <button
        type="button"
        className="live-announcement__dismiss"
        aria-label="Masquer cette annonce sur ce téléphone"
        onClick={() => setDismissedEventId(announcement.eventId)}
      >
        ×
      </button>
    </aside>
  )
}

export default LiveAnnouncementOverlay
