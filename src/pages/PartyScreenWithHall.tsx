import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

import { useParty } from '../features/party/PartyContext'
import { supabase } from '../lib/supabase'
import HallOfFameScreen from './HallOfFameScreen'
import PartyScreen from './PartyScreen'
import PartyScreenAuto from './PartyScreenAuto'
import PhotoHuntScreen from './PhotoHuntScreen'

type RoomPhase = 'idle' | 'open' | 'revealed'

type RoomStateRow = {
  state: {
    phase?: RoomPhase
  } | null
}

function PartyScreenWithHall() {
  const { settings, loading } = useParty()
  const [roomPhase, setRoomPhase] = useState<RoomPhase>('idle')
  const [roomLoading, setRoomLoading] = useState(true)
  const realtimeConnectedRef = useRef(false)

  const loadRoomPhase = useCallback(async () => {
    const { data, error } = await supabase
      .from('live_vote_public_state')
      .select('state')
      .eq('id', 'main')
      .maybeSingle()

    if (error) {
      console.error('Unable to load TV routing room state:', error)
      setRoomLoading(false)
      return
    }

    const row = data as RoomStateRow | null
    setRoomPhase(row?.state?.phase ?? 'idle')
    setRoomLoading(false)
  }, [])

  useEffect(() => {
    void loadRoomPhase()
  }, [loadRoomPhase])

  useEffect(() => {
    const channel = supabase
      .channel('anniv-2026-party-screen-router')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_vote_public_state',
          filter: 'id=eq.main',
        },
        () => void loadRoomPhase(),
      )
      .subscribe((status) => {
        realtimeConnectedRef.current = status === 'SUBSCRIBED'
      })

    const fallback = window.setInterval(() => {
      if (!realtimeConnectedRef.current) void loadRoomPhase()
    }, 30000)

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void loadRoomPhase()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      realtimeConnectedRef.current = false
      window.clearInterval(fallback)
      document.removeEventListener('visibilitychange', handleVisibility)
      void supabase.removeChannel(channel)
    }
  }, [loadRoomPhase])

  if (!loading && settings.phase === 'ended') {
    return <HallOfFameScreen />
  }

  const roomIsLive = roomPhase === 'open' || roomPhase === 'revealed'

  if (!loading && !roomLoading && roomIsLive) {
    return <PartyScreen />
  }

  if (!loading && String(settings.featuredModule) === 'photos') {
    return <PhotoHuntScreen />
  }

  if (
    !loading
    && !roomLoading
    && settings.phase === 'live'
    && !settings.featuredModule
  ) {
    return <PartyScreenAuto />
  }

  return <PartyScreen />
}

export default PartyScreenWithHall
