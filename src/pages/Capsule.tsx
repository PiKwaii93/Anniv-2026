import { useState, type FormEvent } from 'react'
import { usePartyIdentity } from '../features/identity/PartyIdentityContext'
import { ExtrasPage } from '../features/party-extras/ExtrasUI'
import { revealDate, type Letter } from '../features/party-extras/model'
import { usePartyExtras } from '../features/party-extras/usePartyExtras'

function LetterForm({ own, closed, busy, save }: { own: Letter | null; closed: boolean; busy: boolean; save: (payload: Record<string, unknown>) => Promise<boolean> }) {
  const [message, setMessage] = useState(own?.message ?? '')
  const [memory, setMemory] = useState(own?.memory ?? '')
  const [prediction, setPrediction] = useState(own?.prediction ?? '')
  const [notice, setNotice] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setNotice('')
    if (await save({ message, memory, prediction })) setNotice('Ta lettre est bien scellée. Tu peux la modifier tant que la collecte est ouverte.')
  }
  return <form className="extras-panel" onSubmit={(event) => void submit(event)}>
    <h2>{own ? 'Ta lettre est ici.' : 'Quelques mots pour plus tard.'}</h2>
    <p>Un seul champ suffit. Seul Maxence pourra ouvrir ta lettre à la date prévue ; elle ne sera jamais affichée sur la TV.</p>
    <label>Ton message <span className="extras-counter">{message.length}/1200</span><textarea value={message} maxLength={1200} rows={5} disabled={closed || busy} onChange={(event) => { setMessage(event.target.value); setNotice('') }} placeholder="Ce que tu as envie de lui dire…" /></label>
    <label>Un souvenir ensemble <span className="extras-counter">{memory.length}/800</span><textarea value={memory} maxLength={800} rows={3} disabled={closed || busy} onChange={(event) => { setMemory(event.target.value); setNotice('') }} placeholder="Cette fois où…" /></label>
    <label>Une prédiction pour l’année à venir <span className="extras-counter">{prediction.length}/800</span><textarea value={prediction} maxLength={800} rows={3} disabled={closed || busy} onChange={(event) => { setPrediction(event.target.value); setNotice('') }} placeholder="Je parie que l’an prochain…" /></label>
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
