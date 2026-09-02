import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { extrasError, type ExtrasState } from './model'

type Identity = { playerKey: string; sessionToken: string } | null
export function usePartyExtras(identity: Identity = null) {
  const { user } = useAuth()
  const playerKey = identity?.playerKey ?? null
  const sessionToken = identity?.sessionToken ?? null
  const scope = `${user?.id ?? ''}:${playerKey ?? ''}:${sessionToken ?? ''}`
  const currentScope = useRef(scope)
  const [snapshot, setSnapshot] = useState<{ scope: string; data: ExtrasState } | null>(null)
  const [readFailure, setReadFailure] = useState<{ scope: string; message: string } | null>(null)
  const [actionFailure, setActionFailure] = useState<{ scope: string; message: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const request = useRef(0)
  const actionLock = useRef(false)
  const mounted = useRef(true)
  const data = snapshot?.scope === scope ? snapshot.data : null
  const error = (actionFailure?.scope === scope ? actionFailure.message : '') || (readFailure?.scope === scope ? readFailure.message : '')

  const refresh = useCallback(async () => {
    const version = ++request.current
    try {
      const result = await supabase.rpc('get_party_extras', { p_player_key: playerKey, p_session_token: sessionToken })
      if (result.error) throw result.error
      if (mounted.current && currentScope.current === scope && version === request.current) {
        setSnapshot({ scope, data: result.data as ExtrasState })
        setReadFailure(null)
      }
      return true
    } catch (cause) {
      if (mounted.current && currentScope.current === scope && version === request.current) setReadFailure({ scope, message: extrasError(cause) })
      return false
    }
  }, [playerKey, sessionToken, scope])

  useEffect(() => {
    mounted.current = true
    currentScope.current = scope
    void refresh()
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 10000)
    const visible = () => { if (document.visibilityState === 'visible') void refresh() }
    document.addEventListener('visibilitychange', visible)
    return () => { mounted.current = false; window.clearInterval(interval); document.removeEventListener('visibilitychange', visible) }
  }, [refresh, scope])

  const act = async (action: string, payload: Record<string, unknown> = {}) => {
    if (actionLock.current) return false
    actionLock.current = true; setBusy(true); setActionFailure(null)
    try {
      const result = await supabase.rpc('party_extras_action', { p_action: action, p_payload: payload, p_player_key: playerKey, p_session_token: sessionToken })
      if (result.error) throw result.error
      await refresh()
      return true
    } catch (cause) {
      if (mounted.current && currentScope.current === scope) setActionFailure({ scope, message: extrasError(cause) })
      await refresh()
      return false
    } finally { actionLock.current = false; if (mounted.current) setBusy(false) }
  }
  return { data, error, busy, act, refresh }
}
