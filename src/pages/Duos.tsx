import { useState } from 'react'
import { usePartyIdentity } from '../features/identity/PartyIdentityContext'
import { ExtrasPage } from '../features/party-extras/ExtrasUI'
import { usePartyExtras } from '../features/party-extras/usePartyExtras'

export default function Duos() {
  const { identity } = usePartyIdentity()
  const { data, error, busy, act } = usePartyExtras(identity)
  const [confirmSkip, setConfirmSkip] = useState(false)
  const open = !!data && data.settings.duos_visible && data.settings.duos_open && data.phase === 'live'
  const duo = data?.duo
  return <ExtrasPage title="À deux, c’est mieux." eyebrow="Les duos surprise" intro="Un partenaire tiré au sort, un petit défi, une rencontre. Tu participes seulement si tu en as envie." error={error}>
    {!data ? <p className="extras-loading" role="status">Recherche de ton duo…</p> : <section className="extras-panel">
      {!open && <p className="extras-notice">{data.phase === 'preparation' ? 'Les rencontres commenceront quand la soirée sera lancée.' : data.phase === 'ended' ? 'Les duos sont terminés pour cette édition.' : 'Les duos sont en pause pour le moment.'}</p>}
      {duo?.status === 'active' ? <>
        <p className="extras-eyebrow">Ton partenaire</p><h2 className="extras-duo-name">{duo.partner}</h2><p className="extras-duo-prompt">{duo.prompt}</p>
        <div className="extras-checks" aria-live="polite"><span className={duo.confirmed ? 'done' : ''}>{duo.confirmed ? '✓ Tu as confirmé' : '○ Ta confirmation'}</span><span className={duo.partner_confirmed ? 'done' : ''}>{duo.partner_confirmed ? `✓ ${duo.partner} a confirmé` : `○ En attente de ${duo.partner}`}</span></div>
        <p>Une fois le défi fait ensemble, chacun confirme depuis son téléphone.</p>
        <div className="extras-actions"><button disabled={busy || !open || duo.confirmed} onClick={() => void act('duo_confirm', { id: duo.id })}>{duo.confirmed ? 'En attente de ton partenaire' : 'On l’a fait !'}</button><button className="secondary" disabled={busy} onClick={() => setConfirmSkip(true)}>Passer ce défi</button></div>
        {confirmSkip && <div className="extras-notice"><p>Passer mettra fin au défi pour vous deux. Chacun pourra ensuite demander un autre duo, dans la limite de trois attributions.</p><div className="extras-actions"><button disabled={busy} onClick={async () => { if (await act('duo_skip', { id: duo.id })) setConfirmSkip(false) }}>Oui, passer</button><button className="secondary" onClick={() => setConfirmSkip(false)}>Garder ce défi</button></div></div>}
      </> : data.waiting ? <><h2>On te cherche un partenaire.</h2><p role="status">Tu es dans la file. Ton duo apparaîtra automatiquement dès qu’un autre invité disponible participera. Tu peux continuer à profiter de la soirée.</p><button className="secondary" disabled={busy} onClick={() => void act('duo_leave')}>Quitter la file</button></> : <>
        <h2>{duo?.status === 'completed' ? 'Défi validé à deux ✓' : duo?.status === 'skipped' ? 'Ce défi a été passé.' : 'Une rencontre au hasard.'}</h2>
        {duo?.status === 'completed' && <p>Bien joué, {identity?.playerName} et {duo.partner} !</p>}
        <p>Tu seras associé à un autre volontaire. Pas de partenaire répété et trois défis attribués au maximum, même si tu en passes un.</p>
        <p>Aucun défi n’impose de boire, de contact physique ou de publier une photo. Tu peux arrêter à tout moment.</p>
        <button disabled={busy || !open || data.duo_attempts >= 3} onClick={() => void act('duo_join')}>{data.duo_attempts >= 3 ? 'Tes trois défis ont été attribués' : busy ? 'Un instant…' : data.duo_attempts ? 'Rencontrer un autre invité' : 'Je participe'}</button>
      </>}
      <p className="extras-help">{data.duo_attempts}/3 défis attribués · {data.duo_stats.completed} duo{data.duo_stats.completed === 1 ? '' : 's'} validé{data.duo_stats.completed === 1 ? '' : 's'} dans la soirée.</p>
    </section>}
  </ExtrasPage>
}
