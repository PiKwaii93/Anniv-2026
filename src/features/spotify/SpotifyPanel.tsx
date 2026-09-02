import { useState } from 'react'
import type { SpotifyController } from './useSpotify'
import { spotifyMessage } from './messages'

function SpotifySetup({ controller }: { controller: SpotifyController }) {
  const [clientId, setClientId] = useState(controller.data?.client_id ?? '')
  return <details open={!controller.data?.client_id} className="spotify-setup"><summary>Première connexion · configurer Spotify</summary>
    <ol><li>Ouvre le <a className="extras-link" href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">tableau de bord Spotify ↗</a> avec ton compte Premium et crée une application, nommée par exemple <strong>Anniv 2026</strong>.</li><li>Renseigne ton site : <code>https://anniv-2026-pi.vercel.app</code>. Sélectionne <strong>Web API</strong>.</li><li>Dans <strong>Redirect URIs</strong>, ajoute exactement :<input aria-label="Adresse de retour Spotify à copier" readOnly value="https://anniv-2026-pi.vercel.app/admin/spotify/callback" onFocus={(event) => event.target.select()} /></li><li>Enregistre l’application Spotify, puis copie son <strong>Client ID</strong> ici. Le Client Secret n’est pas nécessaire.</li></ol>
    <form onSubmit={(event) => { event.preventDefault(); void controller.run('configure', { client_id: clientId.trim() }) }}><label>Client ID Spotify<input value={clientId} onChange={(event) => setClientId(event.target.value)} maxLength={32} spellCheck={false} autoComplete="off" placeholder="Les 32 caractères du Client ID" /></label><button disabled={controller.busy || controller.data?.connected || !/^[a-f0-9]{32}$/i.test(clientId.trim())}>Enregistrer le Client ID</button></form>
  </details>
}
export default function SpotifyPanel({ controller }: { controller: SpotifyController }) {
  const { data, busy, error, notice, run } = controller
  return <section className="extras-panel spotify-panel" id="spotify"><p className="extras-eyebrow">Spotify · Le PC fait le DJ</p><h2>La musique, pour de vrai.</h2>
    <p>Ton PC diffuse la musique. Tu gardes la main depuis cette régie, sur PC ou téléphone.</p>
    {error && <p role="alert" className="extras-notice extras-notice--error">{error}</p>}{notice && <p role="status" className="extras-notice">{notice}</p>}
    {data?.warning && <p role="status" className="extras-notice">{spotifyMessage(data.warning)}</p>}
    {!data ? <><p role="status">Chargement de la connexion Spotify…</p><button className="secondary" onClick={() => void controller.refresh()}>Actualiser</button></> : <>
      {!data.connected && <SpotifySetup key={data.client_id} controller={controller} />}
      {data.client_id && <div className="extras-actions"><button disabled={busy} onClick={() => void run('connect')}>{data.connected ? 'Reconnecter Spotify' : 'Connecter Spotify'}</button>{data.connected && <button className="secondary" disabled={busy} onClick={() => void run('disconnect')}>Déconnecter du site</button>}</div>}
      {data.connected && <>
        <p className="extras-notice">Compte Spotify connecté. Ouvre Spotify sur ton PC et lance un premier morceau, puis sélectionne ce PC ci-dessous.</p>
        <label>Appareil qui diffuse la musique<select value={data.device_id ?? ''} disabled={busy} onChange={(event) => { if (event.target.value) void run('device', { device_id: event.target.value }) }}><option value="">Choisir le PC…</option>{data.device_id && !data.devices.some((device) => device.id === data.device_id) && <option value={data.device_id}>{data.device_name} · hors ligne</option>}{data.devices.map((device) => <option value={device.id} key={device.id}>{device.name} · {device.type}{device.is_active ? ' · actif' : ''}</option>)}</select></label>
        <button className="secondary" disabled={busy} onClick={() => void controller.refresh()}>Actualiser les appareils</button>
        {data.playback ? <div className="spotify-now"><small>{data.playback.is_playing ? 'En lecture' : 'En pause'} sur {data.playback.device_name}</small><h3>{data.playback.title || 'Lecture Spotify'}</h3><p>{data.playback.artists}</p>{data.device_id && data.playback.device_id !== data.device_id && <p className="extras-notice">Spotify joue sur un autre appareil. Relance un morceau sur le PC sélectionné avant d’envoyer des titres.</p>}</div> : <p>Aucune lecture détectée pour le moment.</p>}
        <div className="extras-actions"><button disabled={busy || !data.device_id} onClick={() => void run('play')}>▶ Lecture sur le PC</button><button className="secondary" disabled={busy || !data.device_id} onClick={() => void run('pause')}>Ⅱ Pause</button><button className="secondary" disabled={busy || !data.device_id} onClick={() => void run('next')}>Suivant →</button></div>
        <p className="extras-help">L’état se rafraîchit toutes les 30 secondes. Les votes aident à choisir avant l’envoi ; les morceaux envoyés restent dans l’ordre de la file Spotify.</p>
      </>}
    </>}
  </section>
}
