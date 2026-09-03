import { Link } from 'react-router-dom'
import { activities } from '../features/guest/navigation'
import { useGuestOverview } from '../features/guest/GuestContext'
import { isPartyModuleVisible, useParty } from '../features/party/PartyContext'

export default function Play() {
  const { settings } = useParty()
  const { extras, room } = useGuestOverview()
  const available = activities.filter(item => isPartyModuleVisible(settings, item.key))
  const duos = extras?.settings.duos_visible && settings.phase !== 'ended'
  return <main className="guest-page">
    <header className="guest-heading"><p>À ton rythme</p><h1>On joue ?</h1><span>Choisis une activité, puis profite de la soirée.</span></header>
    <div className="guest-activity-list">
      {available.map(item => <Link to={item.path} key={item.key} className={`guest-activity guest-activity--${item.key}`}><span className="guest-activity__icon" aria-hidden="true">{item.icon}</span><div><h2>{item.title}</h2><p>{item.key === 'room' && room?.phase === 'open' ? 'Vote ouvert · rejoins la question' : item.detail}</p></div><span aria-hidden="true">→</span></Link>)}
      {duos && <Link to="/duos" className="guest-activity"><span className="guest-activity__icon" aria-hidden="true">↔</span><div><h2>Duos surprise</h2><p>{settings.phase === 'live' ? 'Un partenaire et un défi à deux.' : 'Les rencontres commencent pendant la soirée.'}</p></div><span aria-hidden="true">→</span></Link>}
      {!available.length && !duos && <p className="guest-empty">Les activités ne sont pas encore ouvertes. Profite de la soirée : elles apparaîtront ici.</p>}
    </div>
  </main>
}
