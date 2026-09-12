import { useCallback, useEffect, useRef, useState } from 'react'

import ScreenEventOverlay, { type ScreenEvent } from '../features/screen/ScreenEventOverlay'
import { useParty } from '../features/party/PartyContext'
import { supabase } from '../lib/supabase'
import PartyEndingScreen from './PartyEndingScreen'
import PartyScreen from './PartyScreen'
import PartyScreenAuto from './PartyScreenAuto'
import PhotoHuntScreen from './PhotoHuntScreen'

import './ScreenDirector.css'

type RoomPhase = 'idle' | 'open' | 'revealed'
type RoomStateRow = { state: { phase?: RoomPhase } | null }

const TV_ROOM_POLL_MS = 1500
const TV_PARTY_POLL_MS = 2000
const TV_EVENT_POLL_MS = 2500

function PartyScreenWithHall() {
  const { settings, loading, refresh: refreshParty } = useParty()
  const [roomPhase, setRoomPhase] = useState<RoomPhase>('idle')
  const [roomLoading, setRoomLoading] = useState(true)
  const [currentEvent, setCurrentEvent] = useState<ScreenEvent | null>(null)
  const currentEventRef = useRef<ScreenEvent | null>(null)
  const claimingEventRef = useRef(false)

  useEffect(() => {
    currentEventRef.current = currentEvent
  }, [currentEvent])

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

  const claimNextEvent = useCallback(async () => {
    if (
      loading
      || settings.phase !== 'live'
      || roomPhase !== 'idle'
      || currentEventRef.current
      || claimingEventRef.current
    ) return

    claimingEventRef.current = true
    const { data, error } = await supabase.rpc('claim_next_screen_event', {
      p_consumer: 'tv-main',
    })
    claimingEventRef.current = false

    if (error) {
      console.error('[ScreenDirector][EVENT_CLAIM_ERROR]', error)
      return
    }

    if (!data || typeof data !== 'object') return
    const event = data as ScreenEvent
    if (!event.id || new Date(event.expires_at).getTime() <= Date.now()) {
      window.setTimeout(() => void claimNextEvent(), 100)
      return
    }

    currentEventRef.current = event
    setCurrentEvent(event)
  }, [loading, roomPhase, settings.phase])

  const completeCurrentEvent = useCallback(() => {
    currentEventRef.current = null
    setCurrentEvent(null)
    window.setTimeout(() => void claimNextEvent(), 350)
  }, [claimNextEvent])

  useEffect(() => {
    void loadRoomPhase()
  }, [loadRoomPhase])

  useEffect(() => {
    const channel = supabase
      .channel('anniv-2026-party-screen-router')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'live_vote_public_state', filter: 'id=eq.main',
      }, () => void loadRoomPhase())
      .subscribe()

    const roomPoll = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadRoomPhase()
    }, TV_ROOM_POLL_MS)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void loadRoomPhase()
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

  useEffect(() => {
    if (roomPhase === 'open' || roomPhase === 'revealed') {
      currentEventRef.current = null
      setCurrentEvent(null)
    }
  }, [roomPhase])

  useEffect(() => {
    if (loading || roomLoading || settings.phase !== 'live') return

    const channel = supabase
      .channel('anniv-2026-screen-director-events')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'screen_events',
      }, () => void claimNextEvent())
      .subscribe()
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') void claimNextEvent()
    }, TV_EVENT_POLL_MS)

    void claimNextEvent()
    return () => {
      window.clearInterval(poll)
      void supabase.removeChannel(channel)
    }
  }, [claimNextEvent, loading, roomLoading, settings.phase])

  if (!loading && settings.phase === 'ended') return <PartyEndingScreen />

  const roomIsLive = roomPhase === 'open' || roomPhase === 'revealed'
  const interruptionVisible = !loading && !roomLoading && (roomIsLive || Boolean(currentEvent))
  const ambient = !loading && String(settings.featuredModule) === 'photos'
    ? <PhotoHuntScreen paused={interruptionVisible} />
    : !loading && !roomLoading && settings.phase === 'live' && !settings.featuredModule
      ? <PartyScreenAuto paused={interruptionVisible} />
      : <PartyScreen />

  return (
    <div className="screen-director">
      <div
        className={`screen-director__ambient${interruptionVisible ? ' screen-director__ambient--hidden' : ''}`}
        aria-hidden={interruptionVisible}
      >
        {ambient}
      </div>

      {!loading && !roomLoading && roomIsLive && (
        <div className="screen-director__interruption"><PartyScreen /></div>
      )}

      {!roomIsLive && currentEvent && (
        <ScreenEventOverlay
          key={currentEvent.id}
          event={currentEvent}
          onComplete={completeCurrentEvent}
        />
      )}
    </div>
  )
}

export default PartyScreenWithHall
