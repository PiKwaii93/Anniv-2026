import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { supabase } from '../../lib/supabase'

export type AnnouncementKind =
  | 'info'
  | 'food'
  | 'photo'
  | 'game'
  | 'urgent'

export type PartyAnnouncement = {
  message: string
  kind: AnnouncementKind
  isActive: boolean
  expiresAt: string | null
  eventId: string
  updatedAt: string
}

type AnnouncementRow = {
  id: string
  message: string
  kind: AnnouncementKind
  is_active: boolean
  expires_at: string | null
  event_id: string
  updated_at: string
}

type PublishAnnouncementInput = {
  message: string
  kind?: AnnouncementKind
  durationSeconds?: number | null
}

type AnnouncementContextValue = {
  announcement: PartyAnnouncement
  visible: boolean
  loading: boolean
  saving: boolean
  error: string
  refresh: () => Promise<void>
  publish: (input: PublishAnnouncementInput) => Promise<boolean>
  clear: () => Promise<boolean>
}

const emptyAnnouncement: PartyAnnouncement = {
  message: '',
  kind: 'info',
  isActive: false,
  expiresAt: null,
  eventId: '',
  updatedAt: '',
}

const AnnouncementContext =
  createContext<AnnouncementContextValue | null>(null)

const selectColumns =
  'id, message, kind, is_active, expires_at, event_id, updated_at' as const

function rowToAnnouncement(
  row: AnnouncementRow,
): PartyAnnouncement {
  return {
    message: row.message,
    kind: row.kind,
    isActive: row.is_active,
    expiresAt: row.expires_at,
    eventId: row.event_id,
    updatedAt: row.updated_at,
  }
}

export function AnnouncementProvider({
  children,
}: {
  children: ReactNode
}) {
  const [announcement, setAnnouncement] =
    useState<PartyAnnouncement>(emptyAnnouncement)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [expiryTick, setExpiryTick] = useState(0)

  const refresh = useCallback(async () => {
    const {
      data,
      error: loadError,
    } = await supabase
      .from('party_announcements')
      .select(selectColumns)
      .eq('id', 'main')
      .maybeSingle()

    if (loadError) {
      console.error(
        'Unable to load party announcement:',
        loadError,
      )
      setError('Impossible de synchroniser les annonces live.')
      setLoading(false)
      return
    }

    if (data) {
      setAnnouncement(
        rowToAnnouncement(data as AnnouncementRow),
      )
    } else {
      setAnnouncement(emptyAnnouncement)
    }

    setError('')
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const channel = supabase
      .channel('anniv-2026-party-announcements')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'party_announcements',
          filter: 'id=eq.main',
        },
        () => void refresh(),
      )
      .subscribe()

    const fallback = window.setInterval(
      () => void refresh(),
      15000,
    )

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refresh()
      }
    }

    document.addEventListener(
      'visibilitychange',
      handleVisibility,
    )

    return () => {
      window.clearInterval(fallback)
      document.removeEventListener(
        'visibilitychange',
        handleVisibility,
      )
      void supabase.removeChannel(channel)
    }
  }, [refresh])

  useEffect(() => {
    if (!announcement.isActive || !announcement.expiresAt) {
      return
    }

    const delay =
      new Date(announcement.expiresAt).getTime() - Date.now()

    if (delay <= 0) {
      setExpiryTick((value) => value + 1)
      return
    }

    const timeout = window.setTimeout(
      () => setExpiryTick((value) => value + 1),
      delay + 40,
    )

    return () => window.clearTimeout(timeout)
  }, [
    announcement.eventId,
    announcement.expiresAt,
    announcement.isActive,
  ])

  const visible = useMemo(() => {
    void expiryTick

    if (
      !announcement.isActive ||
      !announcement.message.trim()
    ) {
      return false
    }

    if (!announcement.expiresAt) {
      return true
    }

    return (
      new Date(announcement.expiresAt).getTime() > Date.now()
    )
  }, [announcement, expiryTick])

  const publish = useCallback(
    async ({
      message,
      kind = 'info',
      durationSeconds = 15,
    }: PublishAnnouncementInput) => {
      const trimmed = message.trim()

      if (!trimmed || trimmed.length > 240) {
        setError(
          trimmed.length > 240
            ? 'Une annonce est limitée à 240 caractères.'
            : 'Écris un message avant de le diffuser.',
        )
        return false
      }

      setSaving(true)
      setError('')

      const now = new Date()
      const expiresAt =
        durationSeconds === null
          ? null
          : new Date(
            now.getTime() + durationSeconds * 1000,
          ).toISOString()

      const {
        data,
        error: saveError,
      } = await supabase
        .from('party_announcements')
        .update({
          message: trimmed,
          kind,
          is_active: true,
          expires_at: expiresAt,
          event_id: crypto.randomUUID(),
          updated_at: now.toISOString(),
        })
        .eq('id', 'main')
        .select(selectColumns)
        .single()

      setSaving(false)

      if (saveError) {
        console.error(
          'Unable to publish party announcement:',
          saveError,
        )
        setError('L’annonce n’a pas pu être diffusée.')
        return false
      }

      setAnnouncement(
        rowToAnnouncement(data as AnnouncementRow),
      )
      return true
    },
    [],
  )

  const clear = useCallback(async () => {
    setSaving(true)
    setError('')

    const now = new Date().toISOString()

    const {
      data,
      error: clearError,
    } = await supabase
      .from('party_announcements')
      .update({
        is_active: false,
        expires_at: null,
        event_id: crypto.randomUUID(),
        updated_at: now,
      })
      .eq('id', 'main')
      .select(selectColumns)
      .single()

    setSaving(false)

    if (clearError) {
      console.error(
        'Unable to clear party announcement:',
        clearError,
      )
      setError('Impossible de retirer l’annonce.')
      return false
    }

    setAnnouncement(
      rowToAnnouncement(data as AnnouncementRow),
    )
    return true
  }, [])

  const value = useMemo(
    () => ({
      announcement,
      visible,
      loading,
      saving,
      error,
      refresh,
      publish,
      clear,
    }),
    [
      announcement,
      visible,
      loading,
      saving,
      error,
      refresh,
      publish,
      clear,
    ],
  )

  return (
    <AnnouncementContext.Provider value={value}>
      {children}
    </AnnouncementContext.Provider>
  )
}

export function useAnnouncement() {
  const context = useContext(AnnouncementContext)

  if (!context) {
    throw new Error(
      'useAnnouncement must be used inside AnnouncementProvider',
    )
  }

  return context
}
