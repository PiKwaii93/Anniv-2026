import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { usePartyIdentity } from '../identity/PartyIdentityContext'
import { supabase } from '../../lib/supabase'

export type BringCategory = 'drink' | 'food' | 'equipment' | 'other'
export type BringItem = {
  id: string
  category: BringCategory
  item: string
  quantity: string | null
  note: string | null
  playerName: string
  mine: boolean
  canEdit: boolean
  createdAt: string
  updatedAt: string
}
export type BringState = { ok: true; phase: 'preparation' | 'live' | 'ended'; items: BringItem[] }
export type BringDraft = { category: BringCategory; item: string; quantity: string; note: string }

function bringError(error: unknown) {
  const message = typeof error === 'object' && error && 'message' in error ? String(error.message) : ''
  if (message.includes('IDENTITY_REQUIRED')) return 'Ton identité n’est plus reconnue. Reviens à l’accueil pour te reconnecter.'
  if (message.includes('PARTY_ENDED')) return 'La liste est désormais en lecture seule.'
  if (message.includes('ITEM_LIMIT')) return 'Tu as atteint la limite de 20 éléments.'
  if (message.includes('NOT_ALLOWED') || message.includes('NOT_ADMIN')) return 'Cette action ne t’est pas autorisée.'
  if (message.includes('INVALID_ITEM') || message.includes('INVALID_CATEGORY')) return 'Vérifie le nom, la quantité et la note.'
  return 'Connexion interrompue. Réessaie dans un instant.'
}

export function usePartyBring() {
  const { identity } = usePartyIdentity()
  const { isAdmin } = useAuth()
  const key = identity?.playerKey ?? null
  const token = identity?.sessionToken ?? null
  const enabled = !!key && !!token
  const [data, setData] = useState<BringState | null>(null)
  const [error, setError] = useState('')
  const generation = useRef(0)

  const refresh = useCallback(async () => {
    if (!enabled) return
    const request = ++generation.current
    const { data: next, error: failure } = await supabase.rpc('get_party_bring', {
      p_player_key: key, p_session_token: token, p_admin: isAdmin,
    }).abortSignal(AbortSignal.timeout(12000))
    if (request !== generation.current) return
    if (failure || !next?.ok) setError(bringError(failure))
    else { setData(next as BringState); setError('') }
  }, [enabled, key, token, isAdmin])

  useEffect(() => {
    let running = false
    const visible = async () => {
      if (document.visibilityState === 'hidden' || running) return
      running = true
      try { await refresh() } finally { running = false }
    }
    void visible()
    const timer = window.setInterval(() => void visible(), 4000)
    document.addEventListener('visibilitychange', visible)
    window.addEventListener('online', visible)
    return () => {
      generation.current++
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', visible)
      window.removeEventListener('online', visible)
    }
  }, [refresh])

  const action = useCallback(async (name: 'create' | 'update' | 'delete', payload: Record<string, unknown>) => {
    const { data: result, error: failure } = await supabase.rpc('party_bring_action', {
      p_action: name, p_payload: payload, p_player_key: key, p_session_token: token, p_admin: isAdmin,
    }).abortSignal(AbortSignal.timeout(12000))
    if (failure || !result?.ok) throw new Error(bringError(failure))
    await refresh()
  }, [key, token, isAdmin, refresh])

  return { data, error, loading: enabled && !data && !error, action }
}
