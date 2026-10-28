import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import './PushNotificationsAdmin.css'

type Target = { playerKey: string; playerName: string; deviceCount: number }
type ApiResponse = { ok?: boolean; error?: string; targets?: Target[]; sent?: number; expired?: number; failed?: number }

export default function PushNotificationsAdmin() {
  const [targets, setTargets] = useState<Target[]>([])
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: invokeError } = await supabase.functions.invoke<ApiResponse>('push-test', { body: { action: 'list' } })
    if (invokeError || !data?.ok) {
      setError('Impossible de charger les appareils inscrits.')
    } else {
      setTargets(data.targets ?? [])
      setSelected(current => (data.targets ?? []).some(target => target.playerKey === current) ? current : '')
      setError('')
    }
    setLoading(false)
  }, [])

  useEffect(() => { void Promise.resolve().then(load) }, [load])

  const send = async () => {
    if (!selected || sending) return
    setSending(true)
    setMessage('')
    setError('')
    const { data, error: invokeError } = await supabase.functions.invoke<ApiResponse>('push-test', {
      body: { action: 'send-test', playerKey: selected },
    })
    const nextError = invokeError || !data?.ok
      ? (data?.error === 'NO_SUBSCRIPTION' ? 'Cet appareil n’est plus inscrit.' : 'La notification n’a pas pu être envoyée.')
      : ''
    const nextMessage = !nextError
      ? (data?.sent
          ? `${data.sent} notification envoyée${data.sent === 1 ? '' : 's'}.`
          : `${data?.expired ?? 0} abonnement expiré supprimé${data?.expired === 1 ? '' : 's'}.`)
      : ''
    setSending(false)
    await load()
    setError(nextError)
    setMessage(nextMessage)
  }

  return (
    <main className="push-admin">
      <Link to="/admin" className="back-link">← Administration</Link>
      <header>
        <p>Anniv 2026 / Infrastructure</p>
        <h1>Notifications</h1>
        <span>Teste la chaîne Push sur un appareil volontairement inscrit.</span>
      </header>
      <section className="push-admin__card">
        <div className="push-admin__preview"><strong>🎉 Anniv 2026</strong><span>Les notifications fonctionnent !</span></div>
        <label>
          <span>Invité inscrit</span>
          <select value={selected} disabled={loading || sending} onChange={event => setSelected(event.target.value)}>
            <option value="">{loading ? 'Chargement…' : 'Choisir un invité'}</option>
            {targets.map(target => <option key={target.playerKey} value={target.playerKey}>{target.playerName} · {target.deviceCount} appareil{target.deviceCount === 1 ? '' : 's'}</option>)}
          </select>
        </label>
        {!loading && targets.length === 0 && <p>Aucun appareil n’a encore activé les notifications.</p>}
        <button type="button" disabled={!selected || loading || sending} onClick={() => void send()}>{sending ? 'Envoi…' : 'Envoyer la notification de test'}</button>
        {message && <p className="push-admin__success" role="status">{message}</p>}
        {error && <p className="push-admin__error" role="alert">{error}</p>}
      </section>
    </main>
  )
}
