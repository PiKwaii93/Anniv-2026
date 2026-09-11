import {
  useCallback,
  useEffect,
  useState,
} from 'react'

import { useParty } from '../features/party/PartyContext'
import { supabase } from '../lib/supabase'
import PartyEndingScreen from './PartyEndingScreen'
import PartyScreen from './PartyScreen'
import PartyScreenAuto from './PartyScreenAuto'
import PhotoHuntScreen from './PhotoHuntScreen'

type RoomPhase = 'idle' | 'open' | 'revealed'

type RoomStateRow = {
  state: {
    phase?: RoomPhase
  } | null
}

const TV_ROOM_POLL_MS = 1500
const TV_PARTY_POLL_MS = 2000

function PartyScreenWithHall() {
  const { settings, loading, refresh: refreshParty } = useParty()
  const [roomPhase, setRoomPhase] = useState<RoomPhase>('idle')
  const [roomLoading, setRoomLoading] = useState(true)

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
      .subscribe()

    const roomPoll = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadRoomPhase()
    }, TV_ROOM_POLL_MS)

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void loadRoomPhase()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.clearInterval(roomPoll)
      document.removeEventListener('visibilitychange', handleVisibility)
      void supabase.removeChannel(channel)
    }
  }, [loadRoomPhase])

  useEffect(() => {
    const partyPoll = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshParty()
    }, TV_PARTY_POLL_MS)

    return () => window.clearInterval(partyPoll)
  }, [refreshParty])

  if (!loading && settings.phase === 'ended') {
    return <PartyEndingScreen />
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
