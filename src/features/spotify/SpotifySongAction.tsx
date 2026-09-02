import { useState } from 'react'
import type { Song } from '../party-extras/model'
import type { SpotifyController } from './useSpotify'

export default function SpotifySongAction({ song, controller, refresh }: { song: Song; controller: SpotifyController; refresh: () => Promise<unknown> }) {
  const [title, setTitle] = useState(song.title)
  const [artist, setArtist] = useState(song.artist)
  const [selected, setSelected] = useState('')
  const [dirty, setDirty] = useState(false)
  const choices = controller.choices[song.id]
  const selectedTrack = choices?.find((track) => track.id === selected)
  const query = { song_id: song.id, search_title: title.trim(), search_artist: artist.trim() }
  const dispatch = controller.data?.dispatches[song.id]
  if (dispatch?.state === 'sent') return <span className="extras-pill">✓ Envoyée à Spotify</span>
  if (dispatch?.state === 'uncertain') return <div className="spotify-song-action"><p>Envoi à vérifier dans la file Spotify du PC. Aucun nouvel envoi automatique.</p><div className="extras-actions"><button className="secondary" disabled={controller.busy} onClick={async () => { await controller.run('resolve', { song_id: song.id, resolution: 'sent' }); await refresh() }}>Elle est dans la file</button><button className="secondary" disabled={controller.busy} onClick={() => void controller.run('resolve', { song_id: song.id, resolution: 'absent' })}>J’ai vérifié : elle est absente</button></div></div>
  return <div className="spotify-song-action">
    <p className="extras-help">Recherche Spotify automatique à la validation. Aucun lien à copier.</p>
    {choices !== undefined && <div className="spotify-matches" aria-live="polite">
      <p>{choices.length ? 'Choisis le bon morceau : rien n’a encore été envoyé.' : 'Aucun morceau trouvé. Précise le titre ou l’artiste ci-dessous.'}</p>
      {choices.length > 0 && <fieldset disabled={controller.busy || dirty}><legend>Résultats Spotify pour « {song.title} »</legend>
        {choices.map((track) => <label className="spotify-match" key={track.id}>
          <input type="radio" name={`spotify-track-${song.id}`} value={track.id} checked={selected === track.id} onChange={() => setSelected(track.id)} />
          <span><strong>{track.title}</strong><span>{track.artists}</span><small>{track.album}{track.duration_ms > 0 ? ` · ${Math.floor(track.duration_ms / 60000)}:${String(Math.floor(track.duration_ms / 1000) % 60).padStart(2, '0')}` : ''}</small></span>
        </label>)}
      </fieldset>}
      {selectedTrack && !dirty && <a className="extras-link" href={selectedTrack.url} target="_blank" rel="noreferrer">Voir ce morceau sur Spotify ↗</a>}
    </div>}
    <button disabled={controller.busy || !controller.data?.device_id || dirty || (choices !== undefined && !selectedTrack)} onClick={async () => {
      const payload = selectedTrack ? { song_id: song.id, track_id: selectedTrack.id } : title !== song.title || artist !== song.artist ? query : { song_id: song.id }
      if (await controller.run('queue', payload)) await refresh()
    }}>{controller.busy ? 'Traitement…' : song.status === 'pending' ? 'Accepter et envoyer sur le PC' : 'Envoyer sur le PC'}</button>
    <details open={choices !== undefined}>
      <summary>Préciser la recherche / choisir une autre version</summary>
      <form onSubmit={async (event) => { event.preventDefault(); setSelected(''); await controller.run('search', query); setDirty(false) }}>
        <label>Titre à rechercher<input required maxLength={100} disabled={controller.busy} value={title} onChange={(event) => { setTitle(event.target.value); setSelected(''); setDirty(true) }} /></label>
        <label>Artiste · facultatif<input maxLength={100} disabled={controller.busy} value={artist} onChange={(event) => { setArtist(event.target.value); setSelected(''); setDirty(true) }} /></label>
        <button className="secondary" disabled={controller.busy || !title.trim()}>Rechercher sur Spotify</button>
      </form>
    </details>
  </div>
}
