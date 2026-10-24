import { useEffect, useState } from 'react'
import { usePartyIdentity } from '../identity/PartyIdentityContext'
import { usePwa } from '../pwa/PwaState'
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushAvailability,
  readPushState,
} from './pushClient'
import './push.css'

type State = 'loading' | 'disabled' | 'enabled' | 'denied' | 'unsupported' | 'ios-install-required' | 'error'

export default function PushNotificationsCard() {
  const { identity } = usePartyIdentity()
  const { installed, platform } = usePwa()
  const [state, setState] = useState<State>('loading')
  const [busy, setBusy] = useState(false)
  const availability = getPushAvailability({ installed, platform })

  useEffect(() => {
    if (!identity || availability !== 'available') return
    let active = true
    void readPushState(identity)
      .then(result => {
        if (active) setState(result.permission === 'denied' ? 'denied' : result.enabled ? 'enabled' : 'disabled')
      })
      .catch(() => { if (active) setState('error') })
    return () => { active = false }
  }, [availability, identity])

  if (!identity) return null

  const enable = async () => {
    setBusy(true)
    try {
      const result = await enablePushNotifications(identity)
      setState(result.permission === 'denied' ? 'denied' : result.enabled ? 'enabled' : 'disabled')
    } catch { setState('error') } finally { setBusy(false) }
  }
  const disable = async () => {
    setBusy(true)
    try {
      await disablePushNotifications(identity)
      setState('disabled')
    } catch { setState('error') } finally { setBusy(false) }
  }

  const visibleState: State = availability === 'available' ? state : availability
  const detail = visibleState === 'enabled'
    ? 'Activées sur cet appareil'
    : visibleState === 'denied'
      ? 'Bloquées dans les réglages du navigateur'
      : visibleState === 'unsupported'
        ? 'Indisponibles sur cet appareil'
        : visibleState === 'ios-install-required'
          ? 'Disponibles dans l’app installée'
          : 'Matchs à venir et missions'

  return (
    <details className="push-settings">
      <summary>
        <span className="push-settings__icon" aria-hidden="true">◉</span>
        <span><strong>Notifications</strong><small>{detail}</small></span>
        <span aria-hidden="true">⌄</span>
      </summary>
      <div className="push-settings__body">
        <p>Sois prévenu quand ton match approche ou qu’une nouvelle mission t’attend.</p>
        {visibleState === 'loading' && <small>Vérification…</small>}
        {visibleState === 'disabled' && <button type="button" disabled={busy} onClick={() => void enable()}>{busy ? 'Activation…' : 'Activer les notifications'}</button>}
        {visibleState === 'enabled' && <button type="button" className="push-settings__secondary" disabled={busy} onClick={() => void disable()}>{busy ? 'Désactivation…' : 'Désactiver sur cet appareil'}</button>}
        {visibleState === 'denied' && <small>Autorise Anniv 2026 dans les réglages de notifications de ton téléphone pour les activer.</small>}
        {visibleState === 'ios-install-required' && <small>Ouvre Anniv 2026 depuis son icône sur l’écran d’accueil.</small>}
        {visibleState === 'unsupported' && <small>Ce navigateur ne prend pas en charge les notifications Push.</small>}
        {visibleState === 'error' && <><small>Impossible de synchroniser les notifications pour le moment.</small><button type="button" disabled={busy} onClick={() => void enable()}>Réessayer</button></>}
      </div>
    </details>
  )
}
