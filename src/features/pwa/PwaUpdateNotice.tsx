import { usePwa } from './PwaState'
import './pwa.css'

export default function PwaUpdateNotice() {
  const { applyUpdate, updateAvailable } = usePwa()
  if (!updateAvailable) return null

  return (
    <div className="pwa-update" role="status">
      <span>Une nouvelle version est disponible.</span>
      <button type="button" onClick={applyUpdate}>Actualiser</button>
    </div>
  )
}
