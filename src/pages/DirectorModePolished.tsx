import { Link } from 'react-router-dom'

import DirectorAnnouncementDock from '../features/announcements/DirectorAnnouncementDock'
import PhotoHuntDirectorDock from '../features/photo-hunt/PhotoHuntDirectorDock'
import DirectorMode from './DirectorMode'

import './DirectorModePolish.css'

function DirectorModePolished() {
  return (
    <>
      <DirectorMode />
      <DirectorAnnouncementDock />
      <PhotoHuntDirectorDock />
      <Link
        to="/screen"
        target="_blank"
        rel="noreferrer"
        className="director-tv-launch"
      >
        <span>▣</span>
        <div>
          <small>Grand écran</small>
          <strong>Ouvrir l’écran TV ↗</strong>
        </div>
      </Link>
    </>
  )
}

export default DirectorModePolished
