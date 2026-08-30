import {
  useCallback,
  useEffect,
  useState,
} from 'react'
import { Link } from 'react-router-dom'

import {
  type PartyModule,
  useParty,
} from '../party/PartyContext'
import { supabase } from '../../lib/supabase'

import './PhotoHuntDirectorDock.css'

function PhotoHuntDirectorDock() {
  const { settings, saving, updateSettings } = useParty()
  const [pending, setPending] = useState(0)
  const [approved, setApproved] = useState(0)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const [pendingResult, approvedResult] = await Promise.all([
      supabase
        .from('photo_hunt_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase
        .from('photo_hunt_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved'),
    ])

    if (!pendingResult.error) setPending(pendingResult.count ?? 0)
    if (!approvedResult.error) setApproved(approvedResult.count ?? 0)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()

    const channel = supabase
      .channel('anniv-2026-photo-hunt-director')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'photo_hunt_submissions' },
        () => void refresh(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [refresh])

  const featured = String(settings.featuredModule) === 'photos'

  const featureWall = async () => {
    if (saving) return

    await updateSettings({
      photosVisible: true,
      featuredModule: 'photos' as PartyModule,
    })
  }

  return (
    <section className={featured ? 'photo-director-dock photo-director-dock--featured' : 'photo-director-dock'}>
      <Link to="/admin/photos" className="photo-director-dock__main">
        <span>▧</span>
        <div>
          <small>Photo Hunt</small>
          <strong>
            {loading
              ? 'Synchronisation…'
              : pending > 0
                ? `${pending} photo${pending !== 1 ? 's' : ''} à valider`
                : `${approved} publiée${approved !== 1 ? 's' : ''}`}
          </strong>
        </div>
        {pending > 0 && <b>{pending}</b>}
      </Link>

      <button
        type="button"
        disabled={saving || featured}
        onClick={() => void featureWall()}
      >
        {featured ? 'Mur à la une ✓' : 'Afficher le mur sur la TV'}
      </button>
    </section>
  )
}

export default PhotoHuntDirectorDock
