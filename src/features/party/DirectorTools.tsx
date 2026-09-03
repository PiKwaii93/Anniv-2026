import { Link } from 'react-router-dom'
import DirectorAnnouncementDock from '../announcements/DirectorAnnouncementDock'
import PhotoHuntDirectorDock from '../photo-hunt/PhotoHuntDirectorDock'
import DirectorScenesDock from './DirectorScenesDock'

export type DirectorTool = 'scenes' | 'announcement' | null

export default function DirectorTools({ panel, setPanel }: { panel: DirectorTool; setPanel: (panel: DirectorTool) => void }) {
  return <>
    <Link to="/screen" target="_blank" rel="noreferrer" className="party-director-launch">
      <span>▣</span><strong>Écran TV ↗</strong><small>Ouvrir le grand écran</small>
    </Link>
    <DirectorScenesDock open={panel === 'scenes'} setOpen={open => setPanel(open ? 'scenes' : null)} />
    <DirectorAnnouncementDock open={panel === 'announcement'} setOpen={open => setPanel(open ? 'announcement' : null)} />
    <PhotoHuntDirectorDock />
  </>
}
