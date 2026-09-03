import { Link } from 'react-router-dom'

import DirectorMode from './DirectorMode'

import './DirectorModePolish.css'
import '../features/party-extras/extras.css'

function DirectorModePolished() {
  return (
    <>
      <Link to="/admin/party-extras" className="extras-admin-link">Capsule · Jukebox · Duos · Générique — ouvrir la régie ↗</Link>
      <DirectorMode />
    </>
  )
}

export default DirectorModePolished
