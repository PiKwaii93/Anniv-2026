import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import HomeIdentityOnboarding from '../features/identity/HomeIdentityOnboarding'
import { usePartyIdentity } from '../features/identity/PartyIdentityContext'
import { isPartyModuleVisible, useParty } from '../features/party/PartyContext'
import { usePartyExtras } from '../features/party-extras/usePartyExtras'
import { useGuestOverview } from '../features/guest/GuestContext'
import { activities } from '../features/guest/navigation'
import { supabase } from '../lib/supabase'
import { hasMissionToResume } from '../features/guest/activityMemory'
import ChatHomeLink from '../features/chat/ChatHomeLink'

type PersonalState = { scope: string; pending: number; retry: number; mission: boolean }

export default function Home() {
  const { isAdmin } = useAuth()
  const { identity, loading: identityLoading } = usePartyIdentity()
  const { settings, loading } = useParty()
  const { room, extras } = useGuestOverview()
  const { data: own } = usePartyExtras(identity)
  const [personal, setPersonal] = useState<PersonalState | null>(null)
  const playerKey = identity?.playerKey
  const token = identity?.sessionToken
  const scope = `${playerKey ?? ''}:${token ?? ''}`

  useEffect(() => {
    if (!playerKey || !token) return
    let active = true
    let version = 0
    const refresh = async () => {
      const request = ++version
      const args = { p_player_key: playerKey, p_session_token: token }
      const photos = settings.photosVisible ? await supabase.rpc('get_photo_hunt_player_state', args) : null
      if (!active || version !== request) return
      const submissions: { status: string }[] = photos?.data?.ok ? photos.data.submissions ?? [] : []
      setPersonal({ scope, pending: submissions.filter(photo => photo.status === 'pending').length, retry: submissions.filter(photo => photo.status === 'rejected').length, mission: hasMissionToResume(playerKey) })
    }
    const visible = () => { if (document.visibilityState === 'visible') void refresh() }
    void refresh()
    const timer = window.setInterval(visible, 15000)
    document.addEventListener('visibilitychange', visible)
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', visible) }
  }, [playerKey, token, scope, settings.photosVisible, settings.missionsVisible])

  const phase = settings.phase
  const currentPersonal = personal?.scope === scope ? personal : null
  const liveQuestion = phase === 'live' && settings.roomVisible && room?.phase === 'open'
  const featured = [...activities, { key: 'photos' as const, path: '/photos', title: 'Photos', detail: 'Un défi à capturer ensemble.', icon: '▧' }, { key: 'iceberg' as const, path: '/iceberg', title: 'Iceberg', detail: 'Les histoires de la soirée.', icon: '△' }, { key: 'guests' as const, path: '/guests', title: 'Les invités', detail: 'Retrouve les participants.', icon: '○' }]
    .find(item => item.key === String(settings.featuredModule) && isPartyModuleVisible(settings, item.key))
  const now = phase === 'ended'
    ? { title: 'C’était nous.', detail: 'Les gagnants et les souvenirs de cette soirée.', path: '/hall-of-fame', action: 'Voir le palmarès' }
    : liveQuestion
      ? { title: 'À toi de voter.', detail: room?.prompt || 'Une question est ouverte dans La Salle.', path: '/room', action: 'Participer au vote' }
      : phase === 'live' && featured
        ? { title: featured.title, detail: featured.detail, path: featured.path, action: `Ouvrir ${featured.title}` }
        : { title: phase === 'live' ? 'La soirée est à toi.' : 'On se retrouve bientôt.', detail: phase === 'live' ? 'Un jeu, une photo, un morceau : participe à ton rythme.' : 'Découvre les activités déjà ouvertes.', path: '/play', action: 'Découvrir les jeux' }
  const personalLinks = [
    ...(own?.settings.duos_visible && phase !== 'ended' && own.duo?.status === 'active' ? [{ path: '/duos', title: `Ton duo avec ${own.duo.partner}`, detail: own.duo.confirmed ? 'Tu as confirmé · en attente de ton partenaire' : 'Votre défi est prêt.', icon: '↔' }] : []),
    ...(own?.settings.duos_visible && phase !== 'ended' && own.waiting ? [{ path: '/duos', title: 'Recherche de ton partenaire', detail: 'Tu es dans la file des duos.', icon: '↔' }] : []),
    ...(currentPersonal?.mission && settings.missionsVisible && phase !== 'ended' ? [{ path: '/missions', title: 'Reprendre tes missions', detail: 'Retrouve ta mission discrètement.', icon: '◇' }] : []),
    ...(currentPersonal?.pending && settings.photosVisible ? [{ path: '/photos?view=mine', title: `${currentPersonal.pending} photo${currentPersonal.pending > 1 ? 's' : ''} en validation`, detail: 'Tes envois sont bien reçus.', icon: '▧' }] : []),
    ...(currentPersonal?.retry && settings.photosVisible ? [{ path: '/photos?view=mine', title: `${currentPersonal.retry} photo${currentPersonal.retry > 1 ? 's' : ''} à refaire`, detail: 'Tu peux retenter ces défis.', icon: '▧' }] : []),
  ]

  return <>
    <HomeIdentityOnboarding />
    <main className="guest-page guest-home" inert={!isAdmin && (identityLoading || !identity)}>
      <header className="guest-heading"><p>Anniv 2026 <span className={`guest-phase guest-phase--${phase}`}>{loading ? 'Connexion…' : phase === 'live' ? 'En direct' : phase === 'ended' ? 'Les souvenirs' : 'Avant la soirée'}</span></p><h1>{identity ? `Salut ${identity.playerName}.` : 'Bienvenue.'}</h1></header>
      <section className={`guest-now${liveQuestion ? ' guest-now--live' : ''}`} aria-label="Maintenant"><p className="guest-eyebrow">{phase === 'ended' ? 'Merci à tous' : 'Maintenant'}</p><h2>{now.title}</h2><p>{now.detail}</p><Link to={now.path} className="guest-primary">{now.action} <span aria-hidden="true">→</span></Link></section>
      {personalLinks.length > 0 && <section className="guest-section"><h2>Pour toi</h2><div className="guest-activity-list">{personalLinks.map(item => <Link className="guest-activity" key={item.title} to={item.path}><span className="guest-activity__icon" aria-hidden="true">{item.icon}</span><div><h3>{item.title}</h3><p>{item.detail}</p></div><span aria-hidden="true">→</span></Link>)}</div></section>}
      <ChatHomeLink />
      <section className="guest-section"><h2>Souvenirs & rencontres</h2><div className="guest-discover">
        {extras?.settings.capsule_visible && <Link to="/capsule"><span aria-hidden="true">✉</span><strong>La capsule</strong><small>Quelques mots pour plus tard</small></Link>}
        {settings.icebergVisible && <Link to="/iceberg"><span aria-hidden="true">△</span><strong>L’Iceberg</strong><small>Les histoires entre nous</small></Link>}
        {settings.guestsVisible && <Link to="/guests"><span aria-hidden="true">○</span><strong>Les invités</strong><small>Qui est de la partie ?</small></Link>}
        {phase === 'ended' && settings.photosVisible && <Link to="/photos?view=gallery"><span aria-hidden="true">▧</span><strong>La galerie</strong><small>Revivre la soirée</small></Link>}
      </div>{!extras?.settings.capsule_visible && !settings.icebergVisible && !settings.guestsVisible && !(phase === 'ended' && settings.photosVisible) && <p className="guest-empty">Les souvenirs apparaîtront ici dès leur ouverture.</p>}</section>
      {isAdmin && <Link className="guest-admin-link" to="/admin/live">Ouvrir la régie →</Link>}
    </main>
  </>
}
