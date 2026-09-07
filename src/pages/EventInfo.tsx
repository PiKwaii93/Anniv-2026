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
        <small>Date et heure</small>
        <h2>{formatter.format(new Date(info.event_at))}</h2>
      </article>
      <InfoCard label="Lieu" value={info.venue_name} fallback="Le lieu sera précisé bientôt." />
      <InfoCard label="Adresse" value={info.address} fallback="L’adresse sera précisée bientôt." />
      <InfoCard label="Accès" value={info.access_notes} />
      <InfoCard label="Tenue" value={info.dress_code} />
      <InfoCard label="Stationnement" value={info.parking_notes} />
      <InfoCard label="À savoir" value={info.other_notes} wide />
    </div>}
  </main>
}

function InfoCard({ label, value, fallback, wide = false }: {
  label: string
  value: string
  fallback?: string
  wide?: boolean
}) {
  if (!value.trim() && !fallback) return null
  return <article className={`event-info-card${wide ? ' event-info-card--wide' : ''}`}>
    <small>{label}</small>
    <p className={value.trim() ? '' : 'event-info-muted'}>{value.trim() || fallback}</p>
  </article>
}
