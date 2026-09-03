import { useState, type FormEvent } from 'react'
import { usePartyIdentity } from '../features/identity/PartyIdentityContext'
import { ExtrasPage } from '../features/party-extras/ExtrasUI'
import { revealDate, type Letter } from '../features/party-extras/model'
import { usePartyExtras } from '../features/party-extras/usePartyExtras'
import { capsuleDraftKey, readCapsuleDraft, writeCapsuleDraft, type CapsuleDraft } from '../features/guest/capsuleDraft'

function LetterForm({ own, closed, busy, save }: { own: Letter | null; closed: boolean; busy: boolean; save: (payload: Record<string, unknown>) => Promise<boolean> }) {
  const { identity } = usePartyIdentity()
  const [fields, setFields] = useState<CapsuleDraft>(() => {
    try { return (identity && readCapsuleDraft(window.localStorage, identity.playerKey, own?.updated_at ?? null)) || { message: own?.message ?? '', memory: own?.memory ?? '', prediction: own?.prediction ?? '' } }
    catch { return { message: own?.message ?? '', memory: own?.memory ?? '', prediction: own?.prediction ?? '' } }
  })
  const { message, memory, prediction } = fields
  const [draftStatus, setDraftStatus] = useState('')
  const [notice, setNotice] = useState('')
  const edit = (key: keyof CapsuleDraft, value: string) => {
    const next = { ...fields, [key]: value }
    setFields(next); setNotice('')
    try { setDraftStatus(identity && writeCapsuleDraft(window.localStorage, identity.playerKey, own?.updated_at ?? null, next) ? 'Brouillon conservé 7 jours sur ce téléphone. Il n’est pas encore envoyé.' : 'Brouillon non sauvegardé sur ce téléphone. Garde cette page ouverte jusqu’à l’envoi.') }
    catch { setDraftStatus('Brouillon non sauvegardé sur ce téléphone. Garde cette page ouverte jusqu’à l’envoi.') }
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setNotice('')
    if (await save({ message, memory, prediction })) {
      try { if (identity) window.localStorage.removeItem(capsuleDraftKey(identity.playerKey)) } catch { /* Storage may be unavailable. */ }
      setDraftStatus(''); setNotice('Ta lettre est bien scellée. Tu peux la modifier tant que la collecte est ouverte.')
    }
  }
  return <form className="extras-panel" onSubmit={(event) => void submit(event)}>
    <h2>{own ? 'Ta lettre est ici.' : 'Quelques mots pour plus tard.'}</h2>
    <p>Pour Maxence seulement, à la date prévue. Jamais sur la TV.</p>
    <label>Ton message <span className="extras-counter">{message.length}/1200</span><textarea value={message} maxLength={1200} rows={5} disabled={closed || busy} onChange={event => edit('message', event.target.value)} placeholder="Ce que tu as envie de lui dire…" /></label>
    <details open={memory.length > 0 || prediction.length > 0 || undefined}><summary>Ajouter un souvenir ou une prédiction · facultatif</summary>
    <label>Un souvenir ensemble <span className="extras-counter">{memory.length}/800</span><textarea value={memory} maxLength={800} rows={3} disabled={closed || busy} onChange={event => edit('memory', event.target.value)} placeholder="Cette fois où…" /></label>
    <label>Une prédiction pour l’année à venir <span className="extras-counter">{prediction.length}/800</span><textarea value={prediction} maxLength={800} rows={3} disabled={closed || busy} onChange={event => edit('prediction', event.target.value)} placeholder="Je parie que l’an prochain…" /></label>
    </details>
    {draftStatus && <p className="extras-help">{draftStatus}</p>}
    {!closed && <button disabled={busy || ![message, memory, prediction].some((value) => value.trim())}>{busy ? 'On scelle…' : own ? 'Mettre à jour ma lettre' : 'Sceller ma lettre'}</button>}
    {notice && <p className="extras-notice" role="status">{notice}</p>}
  </form>
}

export default function Capsule() {
  const { identity } = usePartyIdentity()
  const { data, error, busy, act } = usePartyExtras(identity)
  const closed = !!data && (!data.settings.capsule_open || data.capsule.revealed)
  return <ExtrasPage title="À ouvrir plus tard." eyebrow="La capsule temporelle" intro="Un message, un souvenir, une prédiction. Une petite part de cette soirée à garder précieusement." error={error}>
    {!data ? <p className="extras-loading" role="status">Chargement de ta capsule…</p> : !data.settings.capsule_visible ? <p className="extras-notice">La capsule n’est pas ouverte au public pour le moment.</p> : <>
      <p className="extras-notice">{data.capsule.revealed ? 'La date d’ouverture est arrivée. Maxence peut maintenant lire les lettres dans sa régie.' : `Ouverture prévue le ${revealDate(data.settings.capsule_reveal_at)} (heure de Paris).`}{closed && !data.capsule.revealed ? ' La collecte est fermée pour le moment.' : ''}</p>
      <LetterForm key={identity?.playerKey} own={data.capsule.own} closed={closed} busy={busy} save={(payload) => act('capsule_save', payload)} />
    </>}
  </ExtrasPage>
}
