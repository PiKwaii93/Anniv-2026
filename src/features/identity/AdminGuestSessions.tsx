import { useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import './AdminGuestSessions.css'

export default function AdminGuestSessions() {
  const { isAdmin } = useAuth()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const pending = useRef(false)
  const trigger = useRef<HTMLButtonElement>(null)

  async function disconnect() {
    if (!isAdmin || !confirming || pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { data, error: rpcError } = await supabase.rpc('admin_disconnect_party_guests', { p_confirm: true })
      if (rpcError || data?.ok !== true) throw rpcError ?? new Error('Unexpected response')
      setNotice(`${data.disconnected} identité${data.disconnected === 1 ? '' : 's'} libérée${data.disconnected === 1 ? '' : 's'}. Les invités peuvent à nouveau choisir leur prénom.`)
      setConfirming(false)
      trigger.current?.focus()
    } catch (cause) {
      const code = cause && typeof cause === 'object' && 'code' in cause && typeof cause.code === 'string' ? cause.code : ''
      if (['PGRST301', 'PGRST302', 'PGRST303'].includes(code)) {
        setError('Ta session administrateur n’est plus valide. Reconnecte-toi avant de réessayer.')
      } else if (code === '42501') {
        setError('Accès refusé : ce compte n’est pas autorisé à déconnecter les invités.')
      } else if (/^[0-9A-Z]{5}$/.test(code) || /^PGRST\d{3}$/.test(code)) {
        setError(`Déconnexion refusée par le serveur (code ${code}). Aucun accès invité n’a été modifié.`)
      } else {
        setError('Impossible de confirmer la déconnexion : aucune réponse exploitable du serveur. Vérifie l’état des invités avant de réessayer.')
      }
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  if (!isAdmin) return null
  return <section id="sessions" className="admin-guest-sessions" aria-labelledby="guest-sessions-title">
    <div><p className="page-eyebrow">Accès des invités</p><h2 id="guest-sessions-title">Libérer les identités</h2>
      <p>Un téléphone perdu ou un test en navigation privée bloque un prénom ? Déconnecte les invités pour leur permettre de se reconnecter.</p>
      <p>Les messages, votes, scores, missions et photos sont conservés. Les comptes administrateurs restent connectés.</p></div>
    <button ref={trigger} type="button" className="guest-sessions-trigger" disabled={busy} aria-expanded={confirming} aria-controls="guest-sessions-confirm" onClick={() => { setConfirming(true); setNotice(''); setError('') }}>Déconnecter tous les invités</button>
    {confirming && <div id="guest-sessions-confirm" className="guest-sessions-confirm" role="group" aria-label="Confirmation de déconnexion">
      <strong>Déconnecter tout le monde maintenant ?</strong>
      <p>Les anciens accès seront invalidés, même dans les onglets fermés. Chaque invité devra choisir de nouveau son prénom. Évite cette action pendant un jeu en cours.</p>
      <div><button type="button" disabled={busy} onClick={() => { setConfirming(false); setError(''); trigger.current?.focus() }}>Annuler</button>
        <button type="button" className="guest-sessions-danger" disabled={busy} onClick={() => void disconnect()}>{busy ? 'Déconnexion…' : 'Confirmer la déconnexion'}</button></div>
    </div>}
    {error && <p role="alert" className="guest-sessions-error">{error}</p>}
    {notice && <p role="status" className="guest-sessions-notice">{notice}</p>}
  </section>
}
