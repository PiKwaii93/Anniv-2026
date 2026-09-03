import { useRef, useState, type FormEvent } from 'react'
import { spotifyAction, type SpotifyTrackChoice } from './api'

type Identity = { playerKey: string; sessionToken: string } | null
type Props = { identity: Identity; song?: { id: string; title: string; artist: string }; onSent: (title: string) => Promise<unknown>; onAttempt?: () => Promise<unknown> }

export default function GuestSongPicker({ identity, song, onSent, onAttempt }: Props) {
  const [title, setTitle] = useState(song?.title ?? '')
  const [artist, setArtist] = useState(song?.artist ?? '')
  const [choices, setChoices] = useState<SpotifyTrackChoice[] | null>(null)
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [songId] = useState(() => song?.id ?? crypto.randomUUID())
  const lock = useRef(false)
  const track = choices?.find((choice) => choice.id === selected)
  const payload = { player_key: identity?.playerKey, session_token: identity?.sessionToken, song_id: songId }
  const resetResults = () => { setChoices(null); setSelected(''); setError('') }
  const search = async (event: FormEvent) => {
    event.preventDefault()
    if (lock.current || !identity || !title.trim()) return
    lock.current = true; setBusy(true); setError(''); setSelected(''); setChoices(null)
    try {
      const result = await spotifyAction('guest_search', { ...payload, title: title.trim(), artist: artist.trim() })
      setChoices(result.choices ?? [])
    } catch (cause) { setError((cause as Error).message) }
    finally { lock.current = false; setBusy(false) }
  }
  const send = async () => {
    if (lock.current || !identity || !track) return
    lock.current = true; setBusy(true); setError('')
    try {
      const result = await spotifyAction('guest_send', { ...payload, track_id: track.id })
      if (!result.ok) throw new Error('L’envoi n’a pas été confirmé.')
      await onSent(result.title ?? track.title)
    } catch (cause) { setError((cause as Error).message); await onAttempt?.() }
    finally { lock.current = false; setBusy(false) }
  }
  return <div className="spotify-guest-picker">
    <form onSubmit={(event) => void search(event)}>
      <label>Titre<input required maxLength={100} value={title} onChange={(event) => { setTitle(event.target.value); resetResults() }} disabled={busy} placeholder="Le morceau qui fait lever tout le monde" /></label>
      <details open={!!song?.artist || undefined}><summary>Préciser l’artiste · facultatif</summary><label>Artiste<input maxLength={100} value={artist} onChange={(event) => { setArtist(event.target.value); resetResults() }} disabled={busy} placeholder="Si tu le connais" /></label></details>
      <p className="extras-help">Aucun compte Spotify nécessaire.</p>
      <button disabled={busy || !identity || !title.trim()}>{busy ? 'Traitement…' : 'Rechercher mon morceau'}</button>
    </form>
    {error && <p className="extras-notice extras-notice--error" role="alert">{error}</p>}
    {choices !== null && <div className="spotify-matches" aria-live="polite">
      {!choices.length ? <p className="extras-notice">Aucun morceau trouvé. Précise le titre ou ajoute l’artiste, puis relance la recherche. Rien n’a été envoyé à la régie.</p> : <>
        <fieldset disabled={busy}><legend>Quel morceau veux-tu entendre ?</legend>
          {choices.map((choice) => <label className="spotify-match" key={choice.id}>
            <input type="radio" name={`guest-track-${songId}`} checked={selected === choice.id} onChange={() => setSelected(choice.id)} />
            <span><strong>{choice.title}</strong><span>{choice.artists}</span><small>{choice.album} · {Math.floor(choice.duration_ms / 60000)}:{String(Math.floor(choice.duration_ms / 1000) % 60).padStart(2, '0')}</small></span>
          </label>)}
        </fieldset>
        <button type="button" disabled={busy || !track} onClick={() => void send()}>{busy ? 'Envoi…' : 'Ajouter à la file Spotify'}</button>
        <p className="extras-help">Sans couper la musique en cours. Seul l’envoi compte dans tes trois propositions.</p>
      </>}
    </div>}
  </div>
}
