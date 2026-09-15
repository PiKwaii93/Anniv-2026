import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import './EventInfo.css'

export type EventInfoRow = {
  id: 'main'
  event_at: string
  venue_name: string
  address: string
  access_notes: string
  dress_code: string
  parking_notes: string
  other_notes: string
  updated_at: string
}

const formatter = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'full',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
})

export default function EventInfo() {
  const [info, setInfo] = useState<EventInfoRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void supabase
      .from('party_event_info')
      .select('*')
      .eq('id', 'main')
      .single()
      .then(({ data, error: loadError }) => {
        if (!active) return
        if (loadError) setError('Les informations pratiques sont momentanément indisponibles.')
        else setInfo(data as EventInfoRow)
        setLoading(false)
      })
    return () => { active = false }
  }, [])

  const mapsUrl = info?.address.trim()
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(info.address.trim())}`
    : ''

  return <main className="event-info-page">
    <Link to="/" className="event-info-back">← Accueil</Link>
    <header className="event-info-hero">
      <p>Anniv 2026</p>
      <h1>Infos pratiques</h1>
      <span>Tout ce qu’il faut pour arriver tranquille.</span>
    </header>

    {loading && <p className="event-info-state" role="status">Chargement des informations…</p>}
    {error && <p className="event-info-state event-info-state--error" role="alert">{error}</p>}
    {info && <div className="event-info-grid">
      <article className="event-info-card event-info-card--date">
        <span className="event-info-card__icon" aria-hidden="true">24</span>
        <div>
          <small>Date et heure</small>
          <h2>{formatter.format(new Date(info.event_at))}</h2>
        </div>
      </article>
      <article className="event-info-card event-info-card--address">
        <span className="event-info-card__icon" aria-hidden="true">↗</span>
        <div>
          <small>Adresse</small>
          <p className={info.address.trim() ? '' : 'event-info-muted'}>
            {info.address.trim() || 'L’adresse sera précisée bientôt.'}
          </p>
          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noreferrer">
              Ouvrir dans Google Maps
              <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
      </article>
      <InfoCard label="Accès" value={info.access_notes} icon="→" />
      <InfoCard label="Tenue" value={info.dress_code} icon="✦" />
      <InfoCard label="Stationnement" value={info.parking_notes} icon="P" />
      <InfoCard label="À savoir" value={info.other_notes} icon="i" wide />
    </div>}
  </main>
}

function InfoCard({ label, value, fallback, icon, wide = false }: {
  label: string
  value: string
  fallback?: string
  icon: string
  wide?: boolean
}) {
  if (!value.trim() && !fallback) return null
  return <article className={`event-info-card${wide ? ' event-info-card--wide' : ''}`}>
    <span className="event-info-card__icon" aria-hidden="true">{icon}</span>
    <div>
      <small>{label}</small>
      <p className={value.trim() ? '' : 'event-info-muted'}>{value.trim() || fallback}</p>
    </div>
  </article>
}
