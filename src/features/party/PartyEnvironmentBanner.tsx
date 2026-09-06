import { useEffect } from 'react'
import { useParty } from './PartyContext'
import './PartyEnvironmentBanner.css'

export default function PartyEnvironmentBanner() {
  const { settings } = useParty()
  const active = settings.environment === 'rehearsal'

  useEffect(() => {
    document.body.classList.toggle('party-rehearsal-active', active)
    return () => document.body.classList.remove('party-rehearsal-active')
  }, [active])

  if (!active) return null

  return (
    <div className="party-environment-banner" role="status">
      Mode répétition · aucune donnée n’ira dans la vraie soirée
    </div>
  )
}
