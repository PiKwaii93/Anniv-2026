import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ExtrasPage } from '../features/party-extras/ExtrasUI'
import { spotifyAction } from '../features/spotify/api'

export default function SpotifyCallback() {
  const navigate = useNavigate()
  const started = useRef(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (started.current) return
    started.current = true
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code'), state = params.get('state')
    // Remove the short-lived authorization code from browser history immediately.
    window.history.replaceState(window.history.state, '', window.location.pathname)
    const complete = async () => {
      if (params.has('error') || !code || !state) { setError('Connexion Spotify annulée ou incomplète. Tu peux la relancer depuis la régie.'); return }
      try { await spotifyAction('callback', { code, state }); navigate('/admin/party-extras#spotify', { replace: true }) }
      catch (cause) { setError((cause as Error).message) }
    }
    void complete()
  }, [navigate])
  return <ExtrasPage title="Connexion Spotify." eyebrow="Régie · Musique" intro="On relie ton compte à la soirée." error={error} admin>{!error && <p role="status">Validation de ton autorisation…</p>}<Link className="extras-link" to="/admin/party-extras#spotify">Retour à la régie ↗</Link></ExtrasPage>
}
