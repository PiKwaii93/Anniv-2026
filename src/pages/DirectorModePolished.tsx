import { Link } from 'react-router-dom'

import DirectorMode from './DirectorMode'

import './DirectorModePolish.css'

function DirectorModePolished() {
  return (
    <>
      <DirectorMode />
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
