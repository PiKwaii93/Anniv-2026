import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useParty } from '../features/party/PartyContext'
import { supabase } from '../lib/supabase'
import type { EventInfoRow } from './EventInfo'
import './EventInfo.css'

type FormState = Omit<EventInfoRow, 'id' | 'updated_at' | 'event_at'> & {
  event_at: string
}

const emptyForm: FormState = {
  event_at: '', venue_name: '', address: '', access_notes: '',
  dress_code: '', parking_notes: '', other_notes: '',
}

function localInputValue(value: string) {
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export default function EventInfoAdmin() {
  const { settings } = useParty()
  const [form, setForm] = useState<FormState>(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const rehearsal = settings.environment === 'rehearsal'

  useEffect(() => {
    let active = true
    void supabase.from('party_event_info').select('*').eq('id', 'main').single()
      .then(({ data, error: loadError }) => {
        if (!active) return
        if (loadError || !data) setError('Impossible de charger les informations pratiques.')
        else {
          const row = data as EventInfoRow
          setForm({
            event_at: localInputValue(row.event_at),
            venue_name: row.venue_name,
            address: row.address,
            access_notes: row.access_notes,
            dress_code: row.dress_code,
            parking_notes: row.parking_notes,
            other_notes: row.other_notes,
          })
        }
        setLoading(false)
      })
    return () => { active = false }
  }, [])

  const valid = useMemo(() => Boolean(form.event_at), [form.event_at])
  const update = (key: keyof FormState, value: string) => {
    setSaved(false)
    setForm(current => ({ ...current, [key]: value }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid || rehearsal || saving) return
    setSaving(true)
    setError('')
    setSaved(false)
    const { error: saveError } = await supabase.from('party_event_info').update({
      ...form,
      event_at: new Date(form.event_at).toISOString(),
    }).eq('id', 'main')
    if (saveError) setError('Les modifications n’ont pas été enregistrées.')
    else setSaved(true)
    setSaving(false)
  }

  return <main className="event-info-page event-info-admin">
    <Link to="/admin" className="event-info-back">← Administration</Link>
    <header className="event-info-hero">
      <p>Configuration</p>
      <h1>Infos pratiques</h1>
      <span>Ces informations sont visibles par tous les invités.</span>
    </header>
    {rehearsal && <p className="event-info-lock" role="status">Les infos pratiques restent celles de la vraie soirée. Repasse en soirée réelle pour les modifier.</p>}
    {loading ? <p className="event-info-state" role="status">Chargement…</p> : <form className="event-info-form" onSubmit={submit}>
      <Field label="Date et heure" required><input type="datetime-local" required value={form.event_at} onChange={e => update('event_at', e.target.value)} /></Field>
      <Field label="Nom du lieu" limit={80}><input maxLength={80} value={form.venue_name} onChange={e => update('venue_name', e.target.value)} /></Field>
      <Field label="Adresse" limit={240}><textarea maxLength={240} value={form.address} onChange={e => update('address', e.target.value)} /></Field>
      <Field label="Accès" limit={500}><textarea maxLength={500} value={form.access_notes} onChange={e => update('access_notes', e.target.value)} /></Field>
      <Field label="Tenue" limit={160}><textarea maxLength={160} value={form.dress_code} onChange={e => update('dress_code', e.target.value)} /></Field>
      <Field label="Stationnement" limit={300}><textarea maxLength={300} value={form.parking_notes} onChange={e => update('parking_notes', e.target.value)} /></Field>
      <Field label="Autres informations" limit={500} wide><textarea maxLength={500} value={form.other_notes} onChange={e => update('other_notes', e.target.value)} /></Field>
      <div className="event-info-actions">
        <button type="submit" disabled={!valid || rehearsal || saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        <Link to="/info">Voir la page publique →</Link>
      </div>
      {error && <p className="event-info-state event-info-state--error" role="alert">{error}</p>}
      {saved && <p className="event-info-state event-info-state--success" role="status">Informations enregistrées.</p>}
    </form>}
  </main>
}

function Field({ label, limit, required, wide, children }: {
  label: string
  limit?: number
  required?: boolean
  wide?: boolean
  children: ReactNode
}) {
  return <label className={wide ? 'event-info-field event-info-field--wide' : 'event-info-field'}>
    <span>{label}{required ? ' *' : ''}</span>
    {children}
    {limit && <small>{limit} caractères maximum</small>}
  </label>
}
