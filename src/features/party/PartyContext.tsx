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

export type PartyPhase =
  | 'preparation'
  | 'live'
  | 'ended'

export type PartyModule =
  | 'iceberg'
  | 'beer-pong'
  | 'bingo'
  | 'guests'

export type PartySettings = {
  phase: PartyPhase
  featuredModule: PartyModule | null
  icebergVisible: boolean
  beerPongVisible: boolean
  bingoVisible: boolean
  guestsVisible: boolean
}

type PartyStateRow = {
  id: string
  phase: PartyPhase
  featured_module: PartyModule | null
  iceberg_visible: boolean
  beer_pong_visible: boolean
  bingo_visible: boolean
  guests_visible: boolean
}

type PartyContextValue = {
  settings: PartySettings
  loading: boolean
  saving: boolean
  error: string
  refresh: () => Promise<void>
  updateSettings: (
    patch: Partial<PartySettings>,
  ) => Promise<boolean>
}

const defaultSettings: PartySettings = {
  phase: 'preparation',
  featuredModule: null,
  icebergVisible: true,
  beerPongVisible: true,
  bingoVisible: true,
  guestsVisible: true,
}

const PartyContext =
  createContext<PartyContextValue | null>(null)

function rowToSettings(
  row: PartyStateRow,
): PartySettings {
  return {
    phase: row.phase,
    featuredModule: row.featured_module,
    icebergVisible: row.iceberg_visible,
    beerPongVisible: row.beer_pong_visible,
    bingoVisible: row.bingo_visible,
    guestsVisible: row.guests_visible,
  }
}

function settingsPatchToRow(
  patch: Partial<PartySettings>,
) {
  const row: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (patch.phase !== undefined) {
    row.phase = patch.phase
  }

  if (patch.featuredModule !== undefined) {
    row.featured_module = patch.featuredModule
  }

  if (patch.icebergVisible !== undefined) {
    row.iceberg_visible = patch.icebergVisible
  }

  if (patch.beerPongVisible !== undefined) {
    row.beer_pong_visible = patch.beerPongVisible
  }

  if (patch.bingoVisible !== undefined) {
    row.bingo_visible = patch.bingoVisible
  }

  if (patch.guestsVisible !== undefined) {
    row.guests_visible = patch.guestsVisible
  }

  return row
}

export function isPartyModuleVisible(
  settings: PartySettings,
  module: PartyModule,
) {
  switch (module) {
    case 'iceberg':
      return settings.icebergVisible
    case 'beer-pong':
      return settings.beerPongVisible
    case 'bingo':
      return settings.bingoVisible
    case 'guests':
      return settings.guestsVisible
  }
}

export function PartyProvider({
  children,
}: {
  children: ReactNode
}) {
  const [settings, setSettings] =
    useState<PartySettings>(defaultSettings)

  const [loading, setLoading] =
    useState(true)

  const [saving, setSaving] =
    useState(false)

  const [error, setError] =
    useState('')

  const refresh = useCallback(async () => {
    const {
      data,
      error: loadError,
    } = await supabase
      .from('party_state')
      .select(
        'id, phase, featured_module, iceberg_visible, beer_pong_visible, bingo_visible, guests_visible',
      )
      .eq('id', 'main')
      .maybeSingle()

    if (loadError) {
      console.error(
        'Unable to load party state:',
        loadError,
      )
      setError(
        'Impossible de synchroniser l’état de la soirée.',
      )
      setLoading(false)
      return
    }

    if (data) {
      setSettings(
        rowToSettings(data as PartyStateRow),
      )
    }

    setError('')
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const channel = supabase
      .channel('anniv-2026-party-state')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'party_state',
          filter: 'id=eq.main',
        },
        () => {
          void refresh()
        },
      )
      .subscribe()

    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible'
      ) {
        void refresh()
      }
    }

    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange,
    )

    return () => {
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      )
      void supabase.removeChannel(channel)
    }
  }, [refresh])

  const updateSettings = useCallback(
    async (
      patch: Partial<PartySettings>,
    ) => {
      const previousSettings = settings
      const optimisticSettings = {
        ...settings,
        ...patch,
      }

      setSettings(optimisticSettings)
      setSaving(true)
      setError('')

      const {
        data,
        error: updateError,
      } = await supabase
        .from('party_state')
        .update(
          settingsPatchToRow(patch),
        )
        .eq('id', 'main')
        .select(
          'id, phase, featured_module, iceberg_visible, beer_pong_visible, bingo_visible, guests_visible',
        )
        .single()

      setSaving(false)

      if (updateError) {
        console.error(
          'Unable to update party state:',
          updateError,
        )
        setSettings(previousSettings)
        setError(
          'La modification du mode soirée n’a pas été enregistrée.',
        )
        return false
      }

      setSettings(
        rowToSettings(data as PartyStateRow),
      )
      return true
    },
    [settings],
  )

  const value = useMemo(
    () => ({
      settings,
      loading,
      saving,
      error,
      refresh,
      updateSettings,
    }),
    [
      settings,
      loading,
      saving,
      error,
      refresh,
      updateSettings,
    ],
  )

  return (
    <PartyContext.Provider value={value}>
      {children}
    </PartyContext.Provider>
  )
}

export function useParty() {
  const context = useContext(PartyContext)

  if (!context) {
    throw new Error(
      'useParty must be used inside PartyProvider',
    )
  }

  return context
}
