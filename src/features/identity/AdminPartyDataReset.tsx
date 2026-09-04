import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { cleanResetPhotos, getResetStatus, resetPartyData, RESET_REQUEST_KEY, type ResetReceipt } from './partyDataReset'
import './AdminGuestSessions.css'
import './AdminPartyDataReset.css'

export default function AdminPartyDataReset() {
  const { isAdmin } = useAuth()
  const [confirming, setConfirming] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [status, setStatus] = useState<ResetReceipt | null>(null)
  const requestId = useRef<string | null>(null)
  const pending = useRef(false)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!isAdmin) return
    let active = true
    try { requestId.current = localStorage.getItem(RESET_REQUEST_KEY) } catch { /* Optional retry persistence. */ }
    void getResetStatus().then(result => { if (active && !pending.current) setStatus(result) }).catch(() => { if (active && !pending.current) setError('Impossible de vérifier les précédentes remises à zéro. Réessaie quand la connexion est rétablie.') })
    return () => { active = false }
  }, [isAdmin])

  async function run(cleanupOnly = false) {
    if (!isAdmin || pending.current || (!cleanupOnly && (!confirming || confirmation !== 'EFFACER'))) return
    pending.current = true
    setBusy(true); setError(''); setNotice('')
    let committed = cleanupOnly
    let recovered = cleanupOnly
    try {
      let result: ResetReceipt
      if (cleanupOnly) result = await getResetStatus(status?.id)
      else {
        const previous = requestId.current ? await getResetStatus(requestId.current) : null
        requestId.current ??= crypto.randomUUID()
        try { localStorage.setItem(RESET_REQUEST_KEY, requestId.current) } catch { /* UUID remains stable in memory. */ }
        recovered = previous?.id === requestId.current
        result = recovered && previous ? previous : await resetPartyData(requestId.current)
        committed = true
      }
      setStatus(result)
      setConfirming(false); setConfirmation('')
      result = await cleanResetPhotos(result, setStatus)
      setStatus(result)
      requestId.current = null
      try { localStorage.removeItem(RESET_REQUEST_KEY) } catch { /* Optional retry persistence. */ }
      setNotice(recovered ? 'La précédente remise à zéro et son nettoyage sont terminés. Aucune nouvelle remise à zéro des jeux n’a été lancée.' : 'Remise à zéro terminée. Données de jeu et photos effacées ; invités et réglages conservés. Les invités devront choisir à nouveau leur prénom.')
      trigger.current?.focus()
    } catch (cause) {
      const message = cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : ''
      if (committed) setError('Les données sont réinitialisées, mais le nettoyage des fichiers photo n’est pas terminé. Reprends le nettoyage ci-dessous ; il ne remettra pas les jeux à zéro une seconde fois.')
      else if (message.includes('PREPARATION_REQUIRED')) setError('Passe d’abord la soirée en « Préparation » dans le Directeur, puis reviens confirmer ici.')
      else if (message.includes('SPOTIFY_BUSY')) setError('Un envoi Spotify est en cours. Attends sa fin avant de réessayer. Aucune donnée n’a été effacée.')
      else if (message.includes('PHOTO_CLEANUP_PENDING')) {
        setStatus(await getResetStatus().catch(() => null))
        setError('Termine d’abord le nettoyage des photos de la précédente remise à zéro.')
      } else setError('Remise à zéro non confirmée par le serveur. Vérifie ta connexion et ta session admin, puis réessaie : la même demande sera reprise, sans double effacement.')
    } finally { pending.current = false; setBusy(false) }
  }

  if (!isAdmin) return null
  const cleanupPending = (status?.pending ?? 0) > 0
  return <section id="reset-data" className="admin-guest-sessions admin-party-reset" aria-labelledby="party-reset-title">
    <p className="page-eyebrow">Avant la soirée · Zone sensible</p>
    <h2 id="party-reset-title">Effacer les données de test</h2>
    <p>Remets les activités à zéro pour tous les invités. À utiliser uniquement avant la soirée, en mode <Link to="/admin/live">Préparation</Link>.</p>
    <p><strong>Effacés :</strong> musique et votes dans l’app, messages, capsule, photos et fichiers, duos, missions, scores, Bingo, questions jouées et tournoi Beer Pong. Tous les invités sont déconnectés.</p>
    <p><strong>Conservés :</strong> liste et réponses des invités, accompagnants, notes privées, comptes admins, réglages, catalogues de questions/défis et Iceberg. La connexion Spotify reste active ; sa file d’attente externe n’est pas vidée.</p>
    <p>Les données locales des téléphones seront effacées à leur prochaine connexion. Cette action est irréversible dans l’app.</p>
    {cleanupPending ? <div>
      <p role="status">{status?.pending} fichier(s) photo à nettoyer.</p>
      <button type="button" disabled={busy} onClick={() => void run(true)}>{busy ? 'Nettoyage…' : 'Reprendre le nettoyage des photos'}</button>
    </div> : <button ref={trigger} type="button" className="guest-sessions-trigger" disabled={busy} aria-expanded={confirming} aria-controls="party-data-confirm" onClick={() => { setConfirming(true); setError(''); setNotice('') }}>Effacer les données de tout le monde</button>}
    {confirming && !cleanupPending && <form id="party-data-confirm" className="guest-sessions-confirm" onSubmit={event => { event.preventDefault(); void run() }}>
      <strong>Tout remettre à zéro, sans supprimer les invités ?</strong>
      <p>Les contenus et résultats seront définitivement supprimés, y compris les photos. N’utilise pas ce bouton pendant la soirée.</p>
      <label htmlFor="party-reset-word">Tape EFFACER pour confirmer</label>
      <input id="party-reset-word" autoComplete="off" spellCheck={false} value={confirmation} disabled={busy} onChange={event => setConfirmation(event.target.value)} />
      <div><button type="button" disabled={busy} onClick={() => { setConfirming(false); setConfirmation(''); setError(''); trigger.current?.focus() }}>Annuler</button>
        <button type="submit" className="guest-sessions-danger" disabled={busy || confirmation !== 'EFFACER'}>{busy ? 'Remise à zéro…' : 'Effacer définitivement'}</button></div>
    </form>}
    {busy && <p role="status">Traitement en cours. Garde cette page ouverte.</p>}
    {error && <p role="alert" className="guest-sessions-error">{error}</p>}
    {notice && <p role="status" className="guest-sessions-notice">{notice}</p>}
  </section>
}
