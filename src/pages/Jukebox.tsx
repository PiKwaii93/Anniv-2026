import { useState } from 'react'
import { usePartyIdentity } from '../features/identity/PartyIdentityContext'
import { ExtrasPage, SongCard } from '../features/party-extras/ExtrasUI'
import { usePartyExtras } from '../features/party-extras/usePartyExtras'
import GuestSongPicker from '../features/spotify/GuestSongPicker'

export default function Jukebox() {
  const { identity } = usePartyIdentity()
  const { data, error, busy, act, refresh } = usePartyExtras(identity)
  const [draft, setDraft] = useState(0)
  const [notice, setNotice] = useState('')
  const open = !!data && data.settings.jukebox_open && data.phase !== 'ended'
  const sent = async (title: string) => {
    setNotice(`« ${title} » a rejoint la file Spotify. La régie n’a rien à choisir ni à valider.`)
    setDraft((value) => value + 1)
    await refresh()
  }
  return <ExtrasPage title="On met quoi ?" eyebrow="Le jukebox de la soirée" intro="Trouve ta pépite, choisis le bon morceau et ajoute-le à la file de la soirée. Pas besoin d’attendre la régie." error={error}>
    {!data ? <p className="extras-loading" role="status">Chargement du jukebox…</p> : !data.settings.jukebox_visible ? <p className="extras-notice">Le jukebox n’est pas ouvert au public pour le moment.</p> : <div className="extras-grid">
      <section className="extras-panel"><h2>Ta contribution</h2><p>{data.song_count}/3 propositions utilisées. Les titres non retenus comptent aussi.</p>
        {open && data.song_count < 3 ? <GuestSongPicker key={`${identity?.playerKey}:${draft}`} identity={identity} onSent={sent} onAttempt={refresh} /> : <p className="extras-notice">{!open ? 'Les propositions et les votes sont fermés pour le moment.' : 'Tes trois propositions sont envoyées. Place aux votes !'}</p>}
        {notice && <p className="extras-notice" role="status">{notice}</p>}
        {data.songs.filter((song) => song.mine && ['pending', 'rejected'].includes(song.status)).map((song) => <SongCard key={song.id} song={song}>{open && song.status === 'pending' && <details className="spotify-guest-repair"><summary>Préciser mon morceau et l’envoyer</summary><p className="extras-help">Choisis la bonne version toi-même. Cela ne consomme pas une nouvelle proposition.</p><GuestSongPicker key={`${identity?.playerKey}:${song.id}`} identity={identity} song={song} onSent={sent} onAttempt={refresh} /></details>}</SongCard>)}
      </section>
      <section className="extras-panel"><h2>La sélection collective</h2><p>Les morceaux envoyés restent dans l’ordre de la file Spotify. Les votes indiquent vos préférences, sans changer cet ordre.</p>
        {!data.songs.some((song) => ['queued', 'playing'].includes(song.status)) && <p className="extras-empty">La piste est à vous. Les premiers morceaux envoyés apparaîtront ici.</p>}
        {data.songs.filter((song) => ['queued', 'playing'].includes(song.status)).map((song) => <SongCard key={song.id} song={song}>{song.status === 'queued' && <button className={song.voted ? '' : 'secondary'} disabled={busy || !open} aria-pressed={song.voted} aria-label={`${song.voted ? 'Retirer mon vote pour' : 'Voter pour'} ${song.title}`} onClick={() => void act('song_vote', { id: song.id, voted: !song.voted })}>{song.voted ? '♥ Voté' : '♡ Voter'}</button>}</SongCard>)}
        {data.songs.some((song) => song.status === 'played') && <details><summary>Les morceaux déjà passés</summary>{data.songs.filter((song) => song.status === 'played').map((song) => <SongCard key={song.id} song={song} />)}</details>}
      </section>
    </div>}
  </ExtrasPage>
}
