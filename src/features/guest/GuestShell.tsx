import { useEffect, type ReactNode } from 'react'
import { Link, useLocation, useNavigationType } from 'react-router-dom'
import { PartyIdentityBadge } from '../identity/PartyIdentityUI'
import { useParty } from '../party/PartyContext'
import { usePartyExtras } from '../party-extras/usePartyExtras'
import { usePartyIdentity } from '../identity/PartyIdentityContext'
import { useAuth } from '../auth/AuthContext'
import { activeGuestTab, guestTabs } from './navigation'
import { useLiveRoom } from './useLiveRoom'
import { GuestContext } from './GuestContext'
import './guest.css'

export default function GuestShell({ children }: { children: ReactNode }) {
  const { settings, loading } = useParty()
  const { identity, loading: identityLoading } = usePartyIdentity()
  const { isAdmin } = useAuth()
  const { data: extras } = usePartyExtras()
  const room = useLiveRoom()
  const { pathname } = useLocation()
  const onboarding = pathname === '/' && !isAdmin && (identityLoading || !identity)
  const navigationType = useNavigationType()
  const tabs = guestTabs(settings, extras?.settings)
  useEffect(() => {
    if (navigationType !== 'POP') window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname, navigationType])
  return <GuestContext.Provider value={{ extras, room }}>
    <div className="guest-app">
      <header className="guest-topbar" inert={onboarding}>
        <Link className="guest-brand" to="/" aria-label="Anniv 2026 · accueil">ANNIV <span>2026</span></Link>
        <PartyIdentityBadge key={pathname} inline />
      </header>
      {settings.phase === 'live' && settings.roomVisible && room?.phase === 'open' && pathname !== '/room' && pathname !== '/' && <Link className="guest-live-link" to="/room"><span className="guest-live-dot" />Un vote est ouvert <strong>Participer →</strong></Link>}
      {children}
      <nav className="guest-nav" aria-label="Navigation principale" inert={onboarding}>
        {(loading ? tabs.filter(tab => tab.path === '/') : tabs).map(tab => <Link key={tab.path} to={tab.path} aria-current={activeGuestTab(pathname) === tab.path ? 'page' : undefined}><span aria-hidden="true">{tab.icon}</span><strong>{tab.label}</strong></Link>)}
      </nav>
    </div>
  </GuestContext.Provider>
}
