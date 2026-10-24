import { Link, useLocation } from 'react-router-dom'

import { useAuth } from '../auth/AuthContext'
import { adminDestinationForGuestPath } from './navigation'

function AdminShortcut({ immersive = false }: { immersive?: boolean }) {
  const { pathname } = useLocation()
  const { isAdmin } = useAuth()
  const destination = adminDestinationForGuestPath(pathname)
  const target = isAdmin ? destination.path : '/admin/login'

  return (
    <Link
      className={`guest-admin-shortcut${immersive ? ' guest-admin-shortcut--immersive' : ''}`}
      to={target}
      state={{ from: destination.path }}
      aria-label={`Administrer ${destination.label}`}
      title={`Administrer ${destination.label}`}
    >
      <span className="guest-admin-shortcut__icon" aria-hidden="true">⌘</span>
      <span className="guest-admin-shortcut__copy">
        <small>Admin</small>
        <strong>{destination.label}</strong>
      </span>
      <span className="guest-admin-shortcut__arrow" aria-hidden="true">↗</span>
    </Link>
  )
}

export default AdminShortcut
