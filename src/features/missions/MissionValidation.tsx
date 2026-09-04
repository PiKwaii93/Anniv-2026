import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import './MissionValidation.css'

type Identity = { playerKey: string; sessionToken: string }
type Mission = { id: string; assignedAt: string | null }
type Player = { key: string; name: string; detail: string }
type OwnCheck = { id: string; status: 'pending' | 'rejected'; reviewerName: string; missionId: string; assignedAt: string }
type Incoming = { id: string; playerName: string; text: string }
type Checks = { ok: boolean; open: boolean; own: OwnCheck | null; incoming: Incoming[] }

function validationError(code?: string) {
  switch (code) {
    case 'INVALID_SESSION': return 'Ta session a expiré. Reviens à l’accueil pour choisir ton prénom.'
    case 'SELF_VALIDATION': return 'Choisis un autre invité : tu ne peux pas valider ta propre mission.'
    case 'REVIEWER_UNAVAILABLE': return 'Ce témoin n’est plus disponible. Choisis un autre invité.'
    case 'STALE_MISSION': return 'La mission a changé. Cette demande n’est plus valable.'
    case 'NOT_REVIEWER': return 'Seul le témoin choisi peut répondre à cette demande.'
    case 'ALREADY_RESOLVED': return 'Cette demande a déjà reçu une réponse ou a été annulée.'
    case 'VALIDATION_PENDING': return 'Une demande attend déjà une réponse. Annule-la avant de changer de témoin.'
    case 'MISSIONS_CLOSED': return 'Les validations sont en pause : les missions sont fermées ou la soirée est terminée.'
    case 'RATE_LIMITED': return 'Trop de demandes rapprochées. Attends une minute avant de réessayer.'
    default: return 'Action non confirmée. Vérifie ta connexion et réessaie : aucun point ne sera compté deux fois.'
  }
}

function Review({ item, busy, disabled, decide }: { item: Incoming; busy: boolean; disabled: boolean; decide: (id: string, approve: boolean) => void }) {
  const [witnessed, setWitnessed] = useState(false)
  return <details className="mission-check-review">
    <summary>{item.playerName} te demande de valider sa mission</summary>
    <p className="mission-check-secret">{item.text}</p>
    <p>Valide seulement si tu as vu cette mission accomplie. Le joueur recevra 1 point.</p>
    <label className="mission-check-attestation"><input type="checkbox" checked={witnessed} disabled={busy || disabled} onChange={event => setWitnessed(event.target.checked)} />J’ai vu la mission accomplie.</label>
    <div className="mission-check-actions">
      <button className="missions-primary-button" disabled={busy || disabled || !witnessed} onClick={() => decide(item.id, true)}>Confirmer la réussite</button>
      <button className="missions-secondary-button" disabled={busy || disabled} onClick={() => decide(item.id, false)}>Je ne peux pas confirmer</button>
    </div>
  </details>
}

function RequestForm({ players, busy, send }: { players: Player[]; busy: boolean; send: (key: string, id: string) => Promise<boolean> }) {
  const [opened, setOpened] = useState(false)
  const [reviewer, setReviewer] = useState('')
  // Keep the UUID when a network error leaves the outcome unknown.
  const request = useRef<{ reviewer: string; id: string } | null>(null)
  if (!opened) return <button className="missions-primary-button" disabled={busy} onClick={() => setOpened(true)}>Faire valider ma mission</button>
  return <form onSubmit={event => {
    event.preventDefault()
    if (!reviewer || busy) return
    if (request.current?.reviewer !== reviewer) request.current = { reviewer, id: crypto.randomUUID() }
    void send(reviewer, request.current.id).then(ok => { if (ok) { request.current = null; setOpened(false) } })
  }}>
    <label htmlFor="mission-witness">Qui a vu ta mission accomplie ?</label>
    <select id="mission-witness" required value={reviewer} disabled={busy} onChange={event => setReviewer(event.target.value)}>
      <option value="">Choisir un témoin…</option>
      {players.map(player => <option key={player.key} value={player.key}>{player.name} — {player.detail}</option>)}
    </select>
    <p>Seul ce témoin verra ta mission. Il trouvera la demande sur son accueil et dans Missions, depuis son téléphone.</p>
    {players.length === 0 && <p>Aucun autre invité confirmé n’est encore disponible.</p>}
    <div className="mission-check-actions">
      <button type="submit" className="missions-primary-button" disabled={busy || !reviewer}>Demander la validation</button>
      <button type="button" className="missions-secondary-button" disabled={busy} onClick={() => setOpened(false)}>Annuler</button>
    </div>
  </form>
}

export default function MissionValidation({ identity, mission, revealed, players, onChange }: {
  identity: Identity; mission: Mission | null | undefined; revealed: boolean; players: Player[]; onChange: () => void
}) {
  const [checks, setChecks] = useState<Checks | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const locked = useRef(false)
  const version = useRef(0)
  const active = useRef(true)
  const inboxScrolled = useRef(false)
  const { playerKey, sessionToken } = identity
  const refresh = useCallback(async () => {
    if (locked.current) return
    const current = ++version.current
    try {
      const result = await supabase.rpc('get_secret_mission_checks', { p_player_key: playerKey, p_session_token: sessionToken }).abortSignal(AbortSignal.timeout(10000))
      if (!active.current || current !== version.current) return
      if (result.error || !result.data?.ok) { setError(validationError(result.data?.code)); return }
      setChecks(result.data as Checks)
      setError('')
    } catch { if (active.current && current === version.current) setError('Validation hors connexion. Réessaie dans un instant.') }
  }, [playerKey, sessionToken])

  useEffect(() => {
    active.current = true
    const visible = () => { if (document.visibilityState === 'visible') void refresh() }
    void refresh()
    const timer = window.setInterval(visible, 8000)
    document.addEventListener('visibilitychange', visible)
    window.addEventListener('online', visible)
    return () => { active.current = false; version.current++; window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); window.removeEventListener('online', visible) }
  }, [refresh, mission?.id, mission?.assignedAt])

  useEffect(() => {
    if (checks?.incoming.length && !inboxScrolled.current && window.location.hash === '#validations') {
      inboxScrolled.current = true
      document.getElementById('validations')?.scrollIntoView({ block: 'start' })
    }
  }, [checks?.incoming.length])

  const mutate = async (rpc: string, args: Record<string, unknown>, success: string) => {
    if (locked.current) return false
    locked.current = true; version.current++; setBusy(true); setError(''); setNotice('')
    let ok = false
    let failure = ''
    try {
      const result = await supabase.rpc(rpc, { p_player_key: playerKey, p_session_token: sessionToken, ...args }).abortSignal(AbortSignal.timeout(12000))
      ok = !result.error && result.data?.ok === true
      if (!ok) failure = validationError(result.data?.code)
      else if (active.current) setNotice(success)
    } catch { failure = validationError() }
    finally {
      locked.current = false
      if (active.current) {
        setBusy(false)
        await refresh()
        if (failure) setError(failure)
        onChange()
      }
    }
    return ok
  }
  const own = checks?.own && mission && checks.own.missionId === mission.id && checks.own.assignedAt === mission.assignedAt ? checks.own : null
  return <section className="mission-checks" id="validations" aria-label="Validation des missions">
    {checks && checks.incoming.length > 0 && <section aria-labelledby="mission-inbox-title">
      <h2 id="mission-inbox-title">À toi de valider <span>({checks.incoming.length})</span></h2>
      {checks.incoming.map(item => <Review key={item.id} item={item} busy={busy} disabled={!checks.open} decide={(id, approve) => {
        void mutate('decide_secret_mission_check', { p_request_id: id, p_approve: approve }, approve ? 'Mission confirmée. Le joueur a reçu son point.' : 'Réponse envoyée. Aucun point attribué.')
      }} />)}
    </section>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!checks && !error && <p>Connexion aux validations…</p>}
    {checks && !checks.open && <p>Les validations sont en pause : les missions sont fermées ou la soirée est terminée.</p>}
    {mission && checks && <div className="mission-check-own">
      {own?.status === 'pending' ? <>
        <h2>En attente de {own.reviewerName}</h2>
        <p>Demande envoyée. Aucun point n’est ajouté avant sa confirmation. Tu gardes cette mission en attendant.</p>
        <button className="missions-secondary-button" disabled={busy} onClick={() => { void mutate('cancel_secret_mission_check', { p_request_id: own.id }, 'Demande annulée. Tu peux choisir un autre témoin.') }}>Annuler la demande</button>
      </> : <>
        {own?.status === 'rejected' && <p>{own.reviewerName} n’a pas confirmé. Aucun point ajouté. Accomplis la mission avant de refaire une demande.</p>}
        {checks.open && revealed && <RequestForm key={`${mission.id}:${mission.assignedAt}`} players={players.filter(player => player.key !== playerKey)} busy={busy} send={(reviewer, id) => mutate('request_secret_mission_check', { p_mission_id: mission.id, p_assigned_at: mission.assignedAt, p_reviewer_key: reviewer, p_request_id: id }, 'Demande envoyée à ton témoin. En attente de sa confirmation.')} />}
        {!revealed && checks.open && <p>Une mission réussie doit être confirmée par un autre invité avant de rapporter un point.</p>}
      </>}
    </div>}
  </section>
}
