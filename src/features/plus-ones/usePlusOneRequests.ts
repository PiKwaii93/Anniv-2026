import { useCallback, useEffect, useRef, useState } from 'react'

import { useAuth } from '../auth/AuthContext'
import { usePartyIdentity } from '../identity/PartyIdentityContext'
import { supabase } from '../../lib/supabase'

export type PlusOneRequestStatus = 'pending' | 'approved' | 'rejected'

export type PlusOneRequest = {
  id: string
  guestId: string
  guestName: string
  requestedName: string
  note: string | null
  status: PlusOneRequestStatus
  plusOneId: string | null
  createdAt: string
  reviewedAt: string | null
}

type RequestState = {
  ok: boolean
  code?: string
  requests?: PlusOneRequest[]
}

const errorMessage = (cause: unknown) => {
  const message = cause instanceof Error
    ? cause.message
    : typeof cause === 'object' && cause && 'message' in cause
      ? String(cause.message)
      : ''

  if (message.includes('PLUS_ONE_GUEST_REQUIRED')) {
    return 'Choisis ton profil principal pour demander un +1.'
  }
  if (message.includes('PENDING_REQUEST_EXISTS')) {
    return 'Tu as déjà une demande en attente.'
  }
  if (message.includes('INVALID_NAME')) {
    return 'Indique le prénom de ton +1.'
  }
  if (message.includes('NOTE_TOO_LONG')) {
    return 'Le message est trop long.'
  }
  if (message.includes('REQUEST_ALREADY_REVIEWED')) {
    return 'Cette demande a déjà été traitée.'
  }
  if (message.includes('REQUEST_NOT_FOUND')) {
    return 'Cette demande n’est plus disponible.'
  }

  return 'Impossible de synchroniser les demandes de +1 pour le moment.'
}

export function usePlusOneRequests(admin = false) {
  const { identity } = usePartyIdentity()
  const { isAdmin, loading: authLoading } = useAuth()
  const [requests, setRequests] = useState<PlusOneRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(true)
  const actionLock = useRef(false)
  const requestVersion = useRef(0)

  const enabled = admin
    ? !authLoading && isAdmin
    : Boolean(identity?.playerKey.startsWith('guest:'))

  const refresh = useCallback(async () => {
    if (!enabled) {
      setRequests([])
      setLoading(false)
      return false
    }

    const version = ++requestVersion.current
    const { data, error: rpcError } = await supabase.rpc(
      'get_plus_one_requests',
      {
        p_player_key: admin ? null : identity?.playerKey ?? null,
        p_session_token: admin ? null : identity?.sessionToken ?? null,
        p_admin: admin,
      },
    )

    if (!mounted.current || version !== requestVersion.current) return false

    if (rpcError) {
      console.error('[PlusOneRequests][READ_FAILED]', rpcError)
      setError(errorMessage(rpcError))
      setLoading(false)
      return false
    }

    const state = data as RequestState
    if (!state.ok) {
      setError(errorMessage(new Error(state.code)))
      setLoading(false)
      return false
    }

    setRequests(state.requests ?? [])
    setError('')
    setLoading(false)
    return true
  }, [admin, enabled, identity?.playerKey, identity?.sessionToken])

  useEffect(() => {
    mounted.current = true
    void refresh()

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, 30000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      mounted.current = false
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  const act = async (action: string, payload: Record<string, unknown>) => {
    if (!enabled || actionLock.current) return false
    actionLock.current = true
    setBusy(true)
    setError('')

    try {
      const { data, error: rpcError } = await supabase.rpc(
        'plus_one_request_action',
        {
          p_action: action,
          p_payload: payload,
          p_player_key: admin ? null : identity?.playerKey ?? null,
          p_session_token: admin ? null : identity?.sessionToken ?? null,
          p_admin: admin,
        },
      )

      if (rpcError) throw rpcError

      const result = data as RequestState
      if (!result.ok) throw new Error(result.code)

      await refresh()
      return true
    } catch (cause) {
      console.error('[PlusOneRequests][ACTION_FAILED]', { action, cause })
      if (mounted.current) setError(errorMessage(cause))
      await refresh()
      return false
    } finally {
      actionLock.current = false
      if (mounted.current) setBusy(false)
    }
  }

  return { requests, loading, busy, error, act, refresh, enabled }
}
