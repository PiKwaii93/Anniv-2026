import { Link } from 'react-router-dom'
import { useAnnouncement } from '../announcements/AnnouncementContext'
import { useLiveRoom } from '../guest/useLiveRoom'
import { useParty } from './PartyContext'
import { tvStatus } from './tvStatus'
import './MobileRegie.css'

export default function TvStatus() {
  const { settings, loading } = useParty()
  const room = useLiveRoom()
  const { visible } = useAnnouncement()
  const state = tvStatus(settings.phase, settings.featuredModule, room?.phase, visible)
  return <section className="regie-tv" aria-label="Diffusion TV"><div><small>Diffusion TV</small><strong>{loading || !room ? 'Synchronisation…' : state.current}</strong>{state.next && <p>Ensuite : <b>{state.next}</b>{!visible && ' · après la question'}</p>}</div><Link to="/screen" target="_blank" rel="noreferrer">Voir l’écran ↗</Link></section>
}
