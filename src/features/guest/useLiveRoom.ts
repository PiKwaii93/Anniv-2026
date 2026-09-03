import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export type GuestRoom = { phase?: 'idle' | 'open' | 'revealed'; prompt?: string }

// Public state only: no votes, identities or changes to the question lifecycle.
export function useLiveRoom() {
  const [room, setRoom] = useState<GuestRoom | null>(null)
  useEffect(() => {
    let active = true
    let version = 0
    const refresh = async () => {
      const request = ++version
      const result = await supabase.from('live_vote_public_state').select('state').eq('id', 'main').maybeSingle()
      if (active && request === version && !result.error) setRoom(result.data?.state ?? { phase: 'idle' })
    }
    const visible = () => { if (document.visibilityState === 'visible') void refresh() }
    void refresh()
    const channel = supabase.channel('guest-room-status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_vote_public_state' }, visible).subscribe()
    const timer = window.setInterval(visible, 15000)
    document.addEventListener('visibilitychange', visible)
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); void supabase.removeChannel(channel) }
  }, [])
  return room
}
