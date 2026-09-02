import { useState, type FormEvent } from 'react'
import { usePartyIdentity } from '../features/identity/PartyIdentityContext'
import { ExtrasPage, SongCard } from '../features/party-extras/ExtrasUI'
import { usePartyExtras } from '../features/party-extras/usePartyExtras'

export default function Jukebox() {
  const { identity } = usePartyIdentity()
  const { data, error, busy, act } = usePartyExtras(identity)
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [notice, setNotice] = useState('')
  const open = !!data && data.settings.jukebox_open && data.phase !== 'ended'
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setNotice('')
    if (await act('song_submit', { title, artist })) {
      setTitle(''); setArtist(''); setNotice('Bien reçu par la régie. Le site retrouvera le morceau sur Spotify lors de sa validation.')
    }
  }
  return <ExtrasPage title="On met quoi ?" eyebrow="Le jukebox de la soirée" intro="Propose tes pépites, vote pour celles des autres. La régie compose la sélection et choisit ce qui passe." error={error}>
    {!data ? <p className="extras-loading" role="status">Chargement du jukebox…</p> : !data.settings.jukebox_visible ? <p className="extras-notice">Le jukebox n’est pas ouvert au public pour le moment.</p> : <div className="extras-grid">
      <section className="extras-panel"><h2>Ta contribution</h2><p>{data.song_count}/3 propositions utilisées. Les titres non retenus comptent aussi.</p>
        {open && data.song_count < 3 ? <form onSubmit={(event) => void submit(event)}>
          <label>Titre<input required maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} disabled={busy} placeholder="Le morceau qui fait lever tout le monde" /></label>
          <label>Artiste · facultatif<input maxLength={100} value={artist} onChange={(event) => setArtist(event.target.value)} disabled={busy} placeholder="Si tu le connais" /></label>
          <p className="extras-help">Un titre suffit. Le site cherche sur Spotify quand la régie le valide. Ajouter l’artiste aide à trouver la bonne version. Aucun lien ni compte Spotify nécessaire.</p>
          <button disabled={busy || !title.trim()}>{busy ? 'Envoi…' : 'Proposer ce morceau'}</button>
        </form> : <p className="extras-notice">{!open ? 'Les propositions et les votes sont fermés pour le moment.' : 'Tes trois propositions sont envoyées. Place aux votes !'}</p>}
        {notice && <p className="extras-notice" role="status">{notice}</p>}
        {data.songs.filter((song) => song.mine && ['pending', 'rejected'].includes(song.status)).map((song) => <SongCard key={song.id} song={song} />)}
      </section>
      <section className="extras-panel"><h2>La sélection collective</h2><p>Un vote par personne et par titre. Tu peux retirer ton vote tant que le morceau attend son tour.</p>
        {!data.songs.some((song) => ['queued', 'playing'].includes(song.status)) && <p className="extras-empty">La piste est à vous. Les premières propositions retenues apparaîtront ici.</p>}
        {data.songs.filter((song) => ['queued', 'playing'].includes(song.status)).map((song) => <SongCard key={song.id} song={song}>{song.status === 'queued' && <button className={song.voted ? '' : 'secondary'} disabled={busy || !open} aria-pressed={song.voted} aria-label={`${song.voted ? 'Retirer mon vote pour' : 'Voter pour'} ${song.title}`} onClick={() => void act('song_vote', { id: song.id, voted: !song.voted })}>{song.voted ? '♥ Voté' : '♡ Voter'}</button>}</SongCard>)}
        {data.songs.some((song) => song.status === 'played') && <details><summary>Les morceaux déjà passés</summary>{data.songs.filter((song) => song.status === 'played').map((song) => <SongCard key={song.id} song={song} />)}</details>}
      </section>
    </div>}
  </ExtrasPage>
}
