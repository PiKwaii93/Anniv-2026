import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ExtrasPage, SongCard } from '../features/party-extras/ExtrasUI'
import { downloadText, letterExport, revealDate, songExport, type Song, type SongStatus } from '../features/party-extras/model'
import { usePartyExtras } from '../features/party-extras/usePartyExtras'

function Toggle({ label, checked, disabled, change }: { label: string; checked: boolean; disabled: boolean; change: (value: boolean) => void }) {
  return <label className="extras-toggle"><span>{label}</span><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => change(event.target.checked)} /></label>
}

function SongModeration({ song, busy, change }: { song: Song; busy: boolean; change: (status: SongStatus) => void }) {
  return <SongCard song={song}>
    {['pending', 'rejected', 'played'].includes(song.status) && <button disabled={busy} onClick={() => change('queued')}>{song.status === 'pending' ? 'Accepter' : 'Remettre en sélection'}</button>}
    {['pending', 'queued'].includes(song.status) && <button className="secondary" disabled={busy} onClick={() => change('rejected')}>Refuser</button>}
    {song.status === 'queued' && <button disabled={busy} onClick={() => change('playing')}>Marquer en cours</button>}
    {['queued', 'playing'].includes(song.status) && <button className="secondary" disabled={busy} onClick={() => change('played')}>Marquer jouée</button>}
  </SongCard>
}

export default function PartyExtrasAdmin() {
  const { data, error, busy, act } = usePartyExtras()
  const [notice, setNotice] = useState('')
  const action = async (name: string, payload: Record<string, unknown> = {}) => {
    setNotice('')
    if (await act(name, payload)) setNotice(name === 'admin_credits' ? 'Générique relancé. La TV se synchronise sous dix secondes.' : 'Modification enregistrée.')
  }
  const setting = (key: string, value: boolean) => void action('admin_settings', { [key]: value })
  const settings = data?.settings
  return <ExtrasPage title="Les petits plus." eyebrow="Régie · Anniv 2026" intro="Les lettres de demain, la bande-son d’aujourd’hui, les rencontres et le dernier mot de la soirée." error={error} admin>
    <nav className="extras-tabs" aria-label="Les quatre nouveautés"><a href="#capsule">Capsule</a><a href="#jukebox">Jukebox</a><a href="#duos">Duos</a><a href="#credits">Générique</a></nav>
    <div role="status" aria-live="polite">{notice && <p className="extras-notice">{notice}</p>}</div>
    {!data || !settings ? <p className="extras-loading">Chargement de la régie…</p> : <>
      <div className="extras-grid">
        <section id="capsule" className="extras-panel"><p className="extras-eyebrow">01 · Pour plus tard</p><h2>Capsule temporelle</h2>
          <Toggle label="Visible sur le site" checked={settings.capsule_visible} disabled={busy} change={(value) => setting('capsule_visible', value)} />
          <Toggle label="Accepter les lettres" checked={settings.capsule_open} disabled={busy} change={(value) => setting('capsule_open', value)} />
          <label>Date d’ouverture<select value={new Date(settings.capsule_reveal_at).getUTCFullYear() === 2027 ? 'next_birthday' : 'after_party'} disabled={busy} onChange={(event) => void action('admin_settings', { capsule_timing: event.target.value })}><option value="after_party">25 octobre 2026 · midi à Paris</option><option value="next_birthday">24 octobre 2027 · midi à Paris</option></select></label>
          <p><strong>{data.capsule.count} lettre{data.capsule.count === 1 ? '' : 's'} scellée{data.capsule.count === 1 ? '' : 's'}.</strong><br />Ouverture le {revealDate(settings.capsule_reveal_at)} (Paris).</p>
          {!data.capsule.revealed ? <p className="extras-notice">Le contenu reste fermé jusqu’à cette date, même ici. La collecte s’arrête automatiquement à l’ouverture.</p> : <>
            <button disabled={!data.capsule.entries.length} onClick={() => downloadText('capsule-anniv-2026.txt', letterExport(data.capsule.entries))}>Exporter les lettres</button>
            <details><summary>Lire les lettres ({data.capsule.entries.length})</summary>{data.capsule.entries.map((letter, index) => <article className="extras-letter" key={`${letter.player_name}-${index}`}><h3>{letter.player_name}</h3>{letter.message && <p><strong>Message</strong><br />{letter.message}</p>}{letter.memory && <p><strong>Souvenir</strong><br />{letter.memory}</p>}{letter.prediction && <p><strong>Prédiction</strong><br />{letter.prediction}</p>}</article>)}</details>
          </>}
          <Link className="extras-link" to="/capsule">Voir la page invitée ↗</Link>
        </section>
        <div>
          <section id="duos" className="extras-panel"><p className="extras-eyebrow">02 · Les rencontres</p><h2>Duos surprise</h2>
            <Toggle label="Visible sur le site" checked={settings.duos_visible} disabled={busy} change={(value) => setting('duos_visible', value)} />
            <Toggle label="Accepter les participations" checked={settings.duos_open} disabled={busy} change={(value) => setting('duos_open', value)} />
            <p><strong>{data.duo_stats.waiting}</strong> invité{data.duo_stats.waiting === 1 ? '' : 's'} en attente · <strong>{data.duo_stats.completed}</strong> duo{data.duo_stats.completed === 1 ? '' : 's'} validé{data.duo_stats.completed === 1 ? '' : 's'}.</p>
            <p className="extras-help">Ouverts uniquement pendant la soirée. Mettre en pause conserve les duos en cours. Chacun peut toujours quitter la file ou passer son défi.</p>
            <Link className="extras-link" to="/duos">Voir la page invitée ↗</Link>
          </section>
          <section id="credits" className="extras-panel"><p className="extras-eyebrow">03 · Le dernier mot</p><h2>Générique TV</h2>
            <Toggle label="Générique automatique en fin de soirée" checked={settings.credits_enabled} disabled={busy} change={(value) => setting('credits_enabled', value)} />
            <p>Après la scène <strong>Fin de soirée</strong> : prénoms de la liste d’invités confirmés, photos publiées, vrais gagnants, puis Hall of Fame. Les modules masqués restent absents.</p>
            <p className="extras-help">Le générique ne joue qu’une fois par écran et par fin de soirée. Tu peux le relancer ici.</p>
            <button disabled={busy || data.phase !== 'ended'} onClick={() => void action('admin_credits')}>Relancer le générique</button>
            {data.phase !== 'ended' && <p className="extras-help">Disponible après avoir terminé la soirée dans le Directeur.</p>}
          </section>
        </div>
      </div>
      <section id="jukebox" className="extras-panel"><p className="extras-eyebrow">04 · La bande-son</p><h2>Jukebox participatif</h2>
        <Toggle label="Visible sur le site" checked={settings.jukebox_visible} disabled={busy} change={(value) => setting('jukebox_visible', value)} />
        <Toggle label="Accepter les propositions et votes" checked={settings.jukebox_open} disabled={busy} change={(value) => setting('jukebox_open', value)} />
        <p>Accepte une proposition pour la soumettre aux votes. Ouvre son lien pour l’écouter dans ton application musicale, puis marque-la en cours. Ce bouton met à jour le site ; il ne lance pas la musique.</p>
        <div className="extras-actions"><button className="secondary" disabled={!data.songs.some((song) => ['queued', 'playing', 'played'].includes(song.status))} onClick={() => downloadText('jukebox-anniv-2026.txt', songExport(data.songs))}>Exporter la sélection</button><Link className="extras-link" to="/jukebox">Voir la page invitée ↗</Link></div>
        <h3>À valider · {data.songs.filter((song) => song.status === 'pending').length}</h3>
        {!data.songs.some((song) => song.status === 'pending') && <p className="extras-empty">Aucune proposition en attente.</p>}
        {data.songs.filter((song) => song.status === 'pending').map((song) => <SongModeration key={song.id} song={song} busy={busy} change={(status) => void action('admin_song', { id: song.id, status })} />)}
        <h3>La sélection</h3>{data.songs.filter((song) => ['queued', 'playing'].includes(song.status)).map((song) => <SongModeration key={song.id} song={song} busy={busy} change={(status) => void action('admin_song', { id: song.id, status })} />)}
        <details><summary>Déjà jouées et non retenues</summary>{data.songs.filter((song) => ['played', 'rejected'].includes(song.status)).map((song) => <SongModeration key={song.id} song={song} busy={busy} change={(status) => void action('admin_song', { id: song.id, status })} />)}</details>
      </section>
    </>}
  </ExtrasPage>
}
