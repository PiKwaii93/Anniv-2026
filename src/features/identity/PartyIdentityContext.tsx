import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useLocation } from 'react-router-dom'

import { useGuests } from '../guests/GuestsContext'
import { supabase } from '../../lib/supabase'

export type PartyIdentity = {
  playerKey: string
  playerName: string
  detail: string
  sessionToken: string
}

export type PartyIdentityPlayer = {
  key: string
  name: string
  detail: string
}

type StoredIdentity = {
  playerKey: string
  sessionToken: string
}

type ClaimResult = {
  ok: boolean
  code?: string
  playerKey?: string
  playerName?: string
}

type ReleaseResult = {
  ok: boolean
  code?: string
  released?: boolean
}

type PartyIdentityContextValue = {
  identity: PartyIdentity | null
  availablePlayers: PartyIdentityPlayer[]
  loading: boolean
  busy: boolean
  error: string
  migrationConflict: boolean
  claimIdentity: (playerKey: string) => Promise<boolean>
  releaseIdentity: () => Promise<boolean>
}

export const PARTY_IDENTITY_STORAGE_KEY =
  'anniv-2026-party-identity-v1'

export const MISSION_IDENTITY_STORAGE_KEY =
  'anniv-2026-secret-mission-identity-v1'

export const ROOM_IDENTITY_STORAGE_KEY =
  'anniv-2026-live-vote-identity-v1'

const PartyIdentityContext =
  createContext<PartyIdentityContextValue | null>(null)

function parseStoredIdentity(
  value: string | null,
): StoredIdentity | null {
  if (!value) return null

  try {
    const parsed = JSON.parse(value) as Partial<StoredIdentity>

    if (
      typeof parsed.playerKey === 'string' &&
      typeof parsed.sessionToken === 'string' &&
      parsed.playerKey.length > 0 &&
      parsed.sessionToken.length > 0
    ) {
      return {
        playerKey: parsed.playerKey,
        sessionToken: parsed.sessionToken,
      }
    }
  } catch {
    return null
  }

  return null
}

function identityError(code?: string) {
  switch (code) {
    case 'IDENTITY_ALREADY_CLAIMED':
      return 'Cette identité est déjà liée à un autre téléphone.'
    case 'DEVICE_ALREADY_LINKED':
      return 'Ce téléphone est déjà lié à une autre identité.'
    case 'PLAYER_NOT_AVAILABLE':
      return 'Cette personne n’est plus dans la liste des participants confirmés.'
    case 'INVALID_SESSION':
      return 'Cette session d’identité n’est plus valide.'
    default:
      return 'Impossible de synchroniser ton identité pour le moment.'
  }
}

function PartyIdentityProvider({
  children,
}: {
  children: ReactNode
}) {
  const location = useLocation()

  const {
    guests,
    loading: guestsLoading,
  } = useGuests()

  const [identity, setIdentity] =
    useState<PartyIdentity | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [migrationConflict, setMigrationConflict] =
    useState(false)

  const identityEnabled =
    !location.pathname.startsWith('/admin') &&
    location.pathname !== '/screen' &&
    location.pathname !== '/qr'

  const availablePlayers = useMemo<PartyIdentityPlayer[]>(
    () => {
      const players: PartyIdentityPlayer[] = []

      guests
        .filter((guest) => guest.status === 'confirmed')
        .forEach((guest) => {
          players.push({
            key: `guest:${guest.id}`,
            name: guest.name,
            detail: 'Invité',
          })

          guest.plusOnes.forEach((plusOne) => {
            players.push({
              key: `plus:${plusOne.id}`,
              name: plusOne.name,
              detail: `+1 de ${guest.name}`,
            })
          })
        })

      return players.sort((left, right) =>
        left.name.localeCompare(right.name, 'fr', {
          sensitivity: 'base',
        }),
      )
    },
    [guests],
  )

  const playerByKey = useMemo(
    () => new Map(
      availablePlayers.map((player) => [player.key, player]),
    ),
    [availablePlayers],
  )

  const seedModuleStorage = useCallback(
    (stored: StoredIdentity) => {
      const serialized = JSON.stringify(stored)
      window.localStorage.setItem(
        PARTY_IDENTITY_STORAGE_KEY,
        serialized,
      )
      window.localStorage.setItem(
        MISSION_IDENTITY_STORAGE_KEY,
        serialized,
      )
      window.localStorage.setItem(
        ROOM_IDENTITY_STORAGE_KEY,
        serialized,
      )
    },
    [],
  )

  const clearLocalIdentity = useCallback(() => {
    window.localStorage.removeItem(PARTY_IDENTITY_STORAGE_KEY)
    window.localStorage.removeItem(MISSION_IDENTITY_STORAGE_KEY)
    window.localStorage.removeItem(ROOM_IDENTITY_STORAGE_KEY)
  }, [])

  const claimStoredIdentity = useCallback(
    async (
      stored: StoredIdentity,
      quiet = false,
    ) => {
      const player = playerByKey.get(stored.playerKey)

      if (!player) {
        if (!quiet) {
          setError(
            'Cette identité n’est plus disponible parmi les participants confirmés.',
          )
        }
        return false
      }

      const { data, error: rpcError } = await supabase.rpc(
        'claim_party_identity',
        {
          p_player_key: stored.playerKey,
          p_session_token: stored.sessionToken,
        },
      )

      if (rpcError) {
        console.error(
          'Unable to claim global party identity:',
          rpcError,
        )
        if (!quiet) {
          setError(
            'Impossible de synchroniser ton identité.',
          )
        }
        return false
      }

      const result = data as ClaimResult

      if (!result.ok) {
        if (!quiet) {
          setError(identityError(result.code))
        }
        return false
      }

      seedModuleStorage(stored)
      setIdentity({
        playerKey: stored.playerKey,
        playerName: result.playerName ?? player.name,
        detail: player.detail,
        sessionToken: stored.sessionToken,
      })
      setMigrationConflict(false)
      setError('')
      return true
    },
    [playerByKey, seedModuleStorage],
  )

  useEffect(() => {
    if (!identityEnabled) {
      setLoading(false)
      return
    }

    if (guestsLoading) {
      setLoading(true)
      return
    }

    let cancelled = false
    setLoading(true)

    const restore = async () => {
      const globalIdentity = parseStoredIdentity(
        window.localStorage.getItem(PARTY_IDENTITY_STORAGE_KEY),
      )
      const missionIdentity = parseStoredIdentity(
        window.localStorage.getItem(MISSION_IDENTITY_STORAGE_KEY),
      )
      const roomIdentity = parseStoredIdentity(
        window.localStorage.getItem(ROOM_IDENTITY_STORAGE_KEY),
      )

      if (globalIdentity) {
        const ok = await claimStoredIdentity(globalIdentity, true)

        if (!cancelled && !ok) {
          clearLocalIdentity()
          setIdentity(null)
        }

        if (!cancelled) setLoading(false)
        return
      }

      const legacy = [missionIdentity, roomIdentity]
        .filter((candidate): candidate is StoredIdentity => Boolean(candidate))

      const uniquePlayerKeys = new Set(
        legacy.map((candidate) => candidate.playerKey),
      )

      if (uniquePlayerKeys.size > 1) {
        if (!cancelled) {
          setMigrationConflict(true)
          setLoading(false)
        }
        return
      }

      const candidate = missionIdentity ?? roomIdentity

      if (candidate) {
        const ok = await claimStoredIdentity(candidate, true)

        if (!cancelled && !ok) {
          setIdentity(null)
        }
      }

      if (!cancelled) setLoading(false)
    }

    void restore()

    return () => {
      cancelled = true
    }
  }, [
    claimStoredIdentity,
    clearLocalIdentity,
    guestsLoading,
    identityEnabled,
  ])

  const claimIdentity = useCallback(
    async (playerKey: string) => {
      if (busy) return false

      const player = playerByKey.get(playerKey)
      if (!player) {
        setError('Choisis une personne dans la liste.')
        return false
      }

      setBusy(true)
      setError('')

      const legacyMission = parseStoredIdentity(
        window.localStorage.getItem(MISSION_IDENTITY_STORAGE_KEY),
      )
      const legacyRoom = parseStoredIdentity(
        window.localStorage.getItem(ROOM_IDENTITY_STORAGE_KEY),
      )

      const matchingLegacy = [legacyMission, legacyRoom]
        .find((candidate) => candidate?.playerKey === playerKey)

      const stored: StoredIdentity = {
        playerKey,
        sessionToken:
          matchingLegacy?.sessionToken ?? crypto.randomUUID(),
      }

      const ok = await claimStoredIdentity(stored)
      setBusy(false)
      return ok
    },
    [busy, claimStoredIdentity, playerByKey],
  )

  const releaseIdentity = useCallback(async () => {
    if (!identity || busy) return false

    setBusy(true)
    setError('')

    const { data, error: rpcError } = await supabase.rpc(
      'release_party_identity',
      {
        p_player_key: identity.playerKey,
        p_session_token: identity.sessionToken,
      },
    )

    setBusy(false)

    if (rpcError) {
      console.error(
        'Unable to release global party identity:',
        rpcError,
      )
      setError('Impossible de libérer cette identité pour le moment.')
      return false
    }

    const result = data as ReleaseResult

    if (!result.ok) {
      setError(identityError(result.code))
      return false
    }

    clearLocalIdentity()
    setIdentity(null)
    setMigrationConflict(false)
    setError('')
    return true
  }, [busy, clearLocalIdentity, identity])

  const value = useMemo<PartyIdentityContextValue>(
    () => ({
      identity,
      availablePlayers,
      loading,
      busy,
      error,
      migrationConflict,
      claimIdentity,
      releaseIdentity,
    }),
    [
      identity,
      availablePlayers,
      loading,
      busy,
      error,
      migrationConflict,
      claimIdentity,
      releaseIdentity,
    ],
  )

  return (
    <PartyIdentityContext.Provider value={value}>
      {children}
    </PartyIdentityContext.Provider>
  )
}

export function usePartyIdentity() {
  const context = useContext(PartyIdentityContext)

  if (!context) {
    throw new Error(
      'usePartyIdentity must be used inside PartyIdentityProvider',
    )
  }

  return context
}

export default PartyIdentityProvider
