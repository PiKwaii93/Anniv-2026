import { useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useParty, type PartyEnvironment } from './PartyContext'
import './AdminPartyEnvironment.css'

type SwitchReceipt = {
  ok: boolean
  environment: PartyEnvironment
  changed: boolean
}

export default function AdminPartyEnvironment() {
  const { settings, refresh } = useParty()
  const [target, setTarget] = useState<PartyEnvironment | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const pending = useRef(false)

  const rehearsal = settings.environment === 'rehearsal'
  const next: PartyEnvironment = rehearsal ? 'live' : 'rehearsal'
  const canSwitch = settings.phase === 'preparation'

  async function switchEnvironment() {
    if (!target || pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    setNotice('')

    try {
      const { data, error: rpcError } = await supabase.rpc(
        'admin_switch_party_environment',
        {
          p_environment: target,
          p_confirmation: target === 'rehearsal' ? 'REPETITION' : 'SOIREE',
        },
      )
      if (rpcError) throw rpcError
      const result = data as SwitchReceipt | null
      if (!result?.ok || result.environment !== target) throw new Error('INVALID_RECEIPT')
      await refresh()
      setTarget(null)
      setNotice(target === 'rehearsal'
        ? 'Répétition activée. Les données de la vraie soirée sont conservées à l’écart.'
        : 'Retour à la vraie soirée. Les données de répétition sont conservées pour le prochain test.')
    } catch (cause) {
      const message = cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : ''
      if (message.includes('PREPARATION_REQUIRED')) setError('Repasse d’abord la soirée en « Préparation » dans le Directeur.')
      else if (message.includes('PHOTO_CLEANUP_PENDING')) setError('Termine d’abord le nettoyage des photos dans la gestion des invités.')
      else if (message.includes('SPOTIFY_BUSY')) setError('Une commande Spotify est en cours. Attends quelques secondes puis réessaie.')
      else setError('Le changement n’a pas été confirmé par le serveur. Aucune donnée n’a été remplacée.')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return (
    <section className={`party-environment-card party-environment-card--${settings.environment}`} aria-labelledby="party-environment-title">
      <div className="party-environment-card__copy">
        <p className="control-eyebrow">Environnement</p>
        <h2 id="party-environment-title">{rehearsal ? 'Répétition active' : 'Soirée réelle'}</h2>
        <p>{rehearsal
          ? 'Tu peux tester librement. Les vraies données sont rangées dans leur espace protégé.'
          : 'Les actions enregistrées ici appartiennent à la vraie soirée.'}</p>
      </div>
      <button
        type="button"
        disabled={busy || !canSwitch}
        onClick={() => { setTarget(next); setError(''); setNotice('') }}
      >
        {rehearsal ? 'Revenir à la soirée réelle' : 'Entrer en mode répétition'}
      </button>

      {!canSwitch && <p className="party-environment-card__warning">Le changement est disponible uniquement lorsque la soirée est en Préparation.</p>}
      {target && <div className="party-environment-confirm" role="dialog" aria-modal="true" aria-labelledby="party-environment-confirm-title">
        <strong id="party-environment-confirm-title">{target === 'rehearsal' ? 'Activer la répétition ?' : 'Revenir à la vraie soirée ?'}</strong>
        <p>Les invités seront déconnectés. Les données actuelles seront sauvegardées, puis celles de l’autre espace seront restaurées.</p>
        {target === 'rehearsal' && <p>La connexion Spotify reste réelle : évite de lancer une lecture si tu testes seulement l’interface.</p>}
        <div>
          <button type="button" disabled={busy} onClick={() => setTarget(null)}>Annuler</button>
          <button type="button" className="party-environment-confirm__primary" disabled={busy} onClick={() => void switchEnvironment()}>
            {busy ? 'Changement en cours…' : target === 'rehearsal' ? 'Activer la répétition' : 'Restaurer la vraie soirée'}
          </button>
        </div>
      </div>}
      {busy && <p role="status">Sauvegarde et restauration en cours. Garde cette page ouverte.</p>}
      {error && <p className="party-environment-card__error" role="alert">{error}</p>}
      {notice && <p className="party-environment-card__notice" role="status">{notice}</p>}
    </section>
  )
}
