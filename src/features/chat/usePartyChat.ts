import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { usePartyIdentity } from '../identity/PartyIdentityContext'
import { supabase } from '../../lib/supabase'

export type ChatMessage = { id: string; name: string; body: string; created_at: string; mine: boolean }
export type ChatState = { messages: ChatMessage[]; unread: number; latest: string; open: boolean; more: boolean; oldest: string | null }

export function chatError(error: unknown) {
  const message = typeof error === 'object' && error && 'message' in error ? String(error.message) : ''
  if (message.includes('IDENTITY_REQUIRED')) return 'Ton identité n’est plus reconnue. Retourne à l’accueil pour te reconnecter.'
  if (message.includes('CHAT_PAUSED')) return 'La discussion est en pause. Ton message n’a pas été envoyé.'
  if (message.includes('CHAT_RATE_LIMIT')) return 'Un peu de patience : attends quelques secondes avant de renvoyer un message.'
  if (message.includes('CHAT_INVALID_BODY')) return 'Écris entre 1 et 300 caractères.'
  if (message.includes('CHAT_NOT_ALLOWED') || message.includes('NOT_ADMIN')) return 'Cette action ne t’est pas autorisée.'
  return 'Connexion interrompue. Réessaie ; ton texte reste ici et un même envoi ne sera pas publié deux fois.'
}

export function usePartyChat({ admin = false, summary = false, before = null }: { admin?: boolean; summary?: boolean; before?: string | null } = {}) {
  const { identity } = usePartyIdentity()
  const { isAdmin } = useAuth()
  const key = admin ? null : identity?.playerKey ?? null
  const token = admin ? null : identity?.sessionToken ?? null
  const enabled = admin ? isAdmin : !!key && !!token
  const scope = JSON.stringify([key, token, admin, summary, before, enabled])
  const [snapshot, setSnapshot] = useState<{ scope: string; data: ChatState } | null>(null)
  const [failure, setFailure] = useState<{ scope: string; message: string } | null>(null)
  const generation = useRef(0)
  const invalidate = useCallback(() => { generation.current++ }, [])
  const refresh = useCallback(async () => {
    if (!enabled) return
    const request = ++generation.current
    try {
      const { data, error } = await supabase.rpc('get_party_chat', {
        p_player_key: key, p_session_token: token, p_admin: admin, p_summary: summary, p_before: before,
      }).abortSignal(AbortSignal.timeout(12000))
      if (request !== generation.current) return
      if (error || !data) throw error ?? new Error('CHAT_UNAVAILABLE')
      setSnapshot({ scope, data: data as ChatState })
      setFailure(null)
    } catch (error) {
      if (request === generation.current) setFailure({ scope, message: chatError(error) })
    }
  }, [enabled, key, token, admin, summary, before, scope])

  useEffect(() => {
    let running = false
    const visible = async () => {
      if (document.visibilityState === 'hidden' || running) return
      running = true
      try { await refresh() } finally { running = false }
    }
    void visible()
    const timer = window.setInterval(() => void visible(), summary ? 20000 : 3000)
    document.addEventListener('visibilitychange', visible)
    window.addEventListener('online', visible)
    return () => {
      invalidate()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', visible)
      window.removeEventListener('online', visible)
    }
  }, [refresh, summary, invalidate])

  const action = useCallback(async (name: string, payload: Record<string, unknown>) => {
    if (!enabled) throw new Error('IDENTITY_REQUIRED')
    const { data, error } = await supabase.rpc('party_chat_action', {
      p_action: name, p_payload: payload, p_player_key: key, p_session_token: token,
    }).abortSignal(AbortSignal.timeout(12000))
    if (error || !data?.ok) throw error ?? new Error('CHAT_UNAVAILABLE')
    return data as { ok: true; id?: string }
  }, [enabled, key, token])

  const data = enabled && snapshot?.scope === scope ? snapshot.data : null
  const error = failure?.scope === scope ? failure.message : ''
  return { data, error, loading: enabled && !data && !error, refresh, action }
}
