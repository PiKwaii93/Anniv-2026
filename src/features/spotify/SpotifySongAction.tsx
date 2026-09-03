import type { Song } from '../party-extras/model'
import type { SpotifyController } from './useSpotify'

export default function SpotifySongAction({ song, controller, refresh }: { song: Song; controller: SpotifyController; refresh: () => Promise<unknown> }) {
  const dispatch = controller.data?.dispatches[song.id]
  if (dispatch?.state === 'sent') return <span className="extras-pill">✓ Envoyée à Spotify</span>
  if (dispatch?.state === 'uncertain') return <div className="spotify-song-action"><p>Envoi à vérifier dans Spotify. Aucun nouvel envoi automatique.</p><div className="extras-actions"><button className="secondary" disabled={controller.busy} onClick={async () => { await controller.run('resolve', { song_id: song.id, resolution: 'sent' }); await refresh() }}>Elle est dans la file</button><button className="secondary" disabled={controller.busy} onClick={() => void controller.run('resolve', { song_id: song.id, resolution: 'absent' })}>J’ai vérifié : elle est absente</button></div></div>
  if (!/^https:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/[a-zA-Z0-9]{22}(?:[/?#]|$)/.test(song.link)) return <p className="extras-help">À préciser par l’invité depuis son jukebox. Aucun morceau à rechercher ou à choisir dans la régie.</p>
  return <div className="spotify-song-action"><p className="extras-help">Morceau déjà identifié. L’invité peut l’envoyer depuis son jukebox ; ce bouton reste disponible en dépannage.</p><button disabled={controller.busy || !controller.data?.device_id} onClick={async () => { if (await controller.run('queue', { song_id: song.id })) await refresh() }}>{controller.busy ? 'Envoi…' : 'Envoyer le morceau identifié'}</button></div>
}
