import { useState } from 'react'
import type { Song } from '../party-extras/model'
import type { SpotifyController } from './useSpotify'

export default function SpotifySongAction({ song, controller, refresh }: { song: Song; controller: SpotifyController; refresh: () => Promise<unknown> }) {
  const [link, setLink] = useState(song.link.startsWith('https://open.spotify.com/') ? song.link : '')
  const dispatch = controller.data?.dispatches[song.id]
  if (dispatch?.state === 'sent') return <span className="extras-pill">✓ Envoyée à Spotify</span>
  if (dispatch?.state === 'uncertain') return <div className="spotify-song-action"><p>Envoi à vérifier dans la file Spotify du PC. Aucun nouvel envoi automatique.</p><div className="extras-actions"><button className="secondary" disabled={controller.busy} onClick={async () => { await controller.run('resolve', { song_id: song.id, resolution: 'sent' }); await refresh() }}>Elle est dans la file</button><button className="secondary" disabled={controller.busy} onClick={() => void controller.run('resolve', { song_id: song.id, resolution: 'absent' })}>J’ai vérifié : elle est absente</button></div></div>
  return <div className="spotify-song-action"><label>Lien Spotify du morceau<input type="url" value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://open.spotify.com/track/…" aria-label={`Lien Spotify pour ${song.title}`} maxLength={500} /></label><button disabled={controller.busy || !controller.data?.device_id || !link.trim()} onClick={async () => { if (await controller.run('queue', { song_id: song.id, link: link.trim() })) await refresh() }}>{song.status === 'pending' ? 'Accepter et envoyer sur le PC' : 'Envoyer sur le PC'}</button></div>
}
