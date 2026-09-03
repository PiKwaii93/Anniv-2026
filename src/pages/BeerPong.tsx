import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../features/auth/AuthContext'
import { usePartyIdentity } from '../features/identity/PartyIdentityContext'
import { useGuests } from '../features/guests/GuestsContext'
import { supabase } from '../lib/supabase'

import './BeerPong.css'

type Player = {
  id: string
  name: string
  type: 'guest' | 'plusOne'
  parentGuestName?: string
}

type DraftMode = 'random' | 'manual'

type Team = {
  id: string
  playerIds: [string, string]
  locked: boolean
}

type Match = {
  id: string
  teamAId: string | null
  teamBId: string | null
  winnerTeamId: string | null
}

type BeerPongState = {
  selectedPlayerIds: string[]
  playerSnapshots: Player[]
  teams: Team[]
  draftMode: DraftMode
  draftValidated: boolean
  rounds: Match[][]
  championTeamId: string | null
}

type BeerPongRow = {
  state: unknown
}

const initialState: BeerPongState = {
  selectedPlayerIds: [],
  playerSnapshots: [],
  teams: [],
  draftMode: 'random',
  draftValidated: false,
  rounds: [],
  championTeamId: null,
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizePlayer(
  value: unknown,
): Player | null {
  if (!isRecord(value)) {
    return null
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    (value.type !== 'guest' && value.type !== 'plusOne')
  ) {
    return null
  }

  return {
    id: value.id,
    name: value.name,
    type: value.type,
    ...(typeof value.parentGuestName === 'string'
      ? { parentGuestName: value.parentGuestName }
      : {}),
  }
}

function normalizeTeam(
  value: unknown,
): Team | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !Array.isArray(value.playerIds) ||
    value.playerIds.length !== 2 ||
    typeof value.playerIds[0] !== 'string' ||
    typeof value.playerIds[1] !== 'string'
  ) {
    return null
  }

  return {
    id: value.id,
    playerIds: [
      value.playerIds[0],
      value.playerIds[1],
    ],
    locked: value.locked === true,
  }
}

function normalizeMatch(
  value: unknown,
): Match | null {
  if (!isRecord(value) || typeof value.id !== 'string') {
    return null
  }

  const teamAId =
    typeof value.teamAId === 'string'
      ? value.teamAId
      : null

  const teamBId =
    typeof value.teamBId === 'string'
      ? value.teamBId
      : null

  if (!teamAId && !teamBId) {
    return null
  }

  let winnerTeamId =
    typeof value.winnerTeamId === 'string' &&
    (value.winnerTeamId === teamAId || value.winnerTeamId === teamBId)
      ? value.winnerTeamId
      : null

  if (!winnerTeamId && teamAId && !teamBId) {
    winnerTeamId = teamAId
  }

  if (!winnerTeamId && teamBId && !teamAId) {
    winnerTeamId = teamBId
  }

  return {
    id: value.id,
    teamAId,
    teamBId,
    winnerTeamId,
  }
}

function normalizeState(
  value: unknown,
): BeerPongState {
  if (!isRecord(value)) {
    return initialState
  }

  const selectedPlayerIds = Array.isArray(value.selectedPlayerIds)
    ? [
        ...new Set(
          value.selectedPlayerIds.filter(
            (playerId): playerId is string => typeof playerId === 'string',
          ),
        ),
      ]
    : []

  const playerSnapshots = Array.isArray(value.playerSnapshots)
    ? value.playerSnapshots
        .map(normalizePlayer)
        .filter((player): player is Player => player !== null)
    : []

  const uniquePlayerSnapshots = [
    ...new Map(
      playerSnapshots.map((player) => [player.id, player]),
    ).values(),
  ]

  const teams = Array.isArray(value.teams)
    ? value.teams
        .map(normalizeTeam)
        .filter((team): team is Team => team !== null)
    : []

  const rounds = Array.isArray(value.rounds)
    ? value.rounds
        .map((round) => {
          if (!Array.isArray(round)) {
            return []
          }

          return round
            .map(normalizeMatch)
            .filter((match): match is Match => match !== null)
        })
        .filter((round) => round.length > 0)
    : []

  const teamIds = new Set(teams.map((team) => team.id))

  const championTeamId =
    typeof value.championTeamId === 'string' &&
    teamIds.has(value.championTeamId)
      ? value.championTeamId
      : null

  return {
    selectedPlayerIds,
    playerSnapshots: uniquePlayerSnapshots,
    teams,
    draftMode: value.draftMode === 'manual' ? 'manual' : 'random',
    draftValidated: value.draftValidated === true,
    rounds,
    championTeamId,
  }
}

function shuffle<T>(
  items: T[],
): T[] {
  const shuffled = [...items]

  for (
    let index = shuffled.length - 1;
    index > 0;
    index -= 1
  ) {
    const randomIndex = Math.floor(
      Math.random() * (index + 1),
    )

    const temporary = shuffled[index]
    shuffled[index] = shuffled[randomIndex]
    shuffled[randomIndex] = temporary
  }

  return shuffled
}

function createManualTeams(
  playerIds: string[],
): Team[] {
  const teams: Team[] = []

  for (
    let index = 0;
    index + 1 < playerIds.length;
    index += 2
  ) {
    teams.push({
      id: crypto.randomUUID(),
      playerIds: [
        playerIds[index],
        playerIds[index + 1],
      ],
      locked: false,
    })
  }

  return teams
}

function createRandomTeams(
  playerIds: string[],
  currentTeams: Team[],
): Team[] {
  const selectedPlayerSet = new Set(playerIds)
  const lockedTeams: Team[] = []
  const lockedPlayerIds = new Set<string>()

  for (const team of currentTeams) {
    const [playerAId, playerBId] = team.playerIds

    if (
      !team.locked ||
      playerAId === playerBId ||
      !selectedPlayerSet.has(playerAId) ||
      !selectedPlayerSet.has(playerBId) ||
      lockedPlayerIds.has(playerAId) ||
      lockedPlayerIds.has(playerBId)
    ) {
      continue
    }

    lockedTeams.push(team)
    lockedPlayerIds.add(playerAId)
    lockedPlayerIds.add(playerBId)
  }

  const remainingPlayerIds = shuffle(
    playerIds.filter(
      (playerId) => !lockedPlayerIds.has(playerId),
    ),
  )

  const randomTeams: Team[] = []

  for (
    let index = 0;
    index + 1 < remainingPlayerIds.length;
    index += 2
  ) {
    randomTeams.push({
      id: crypto.randomUUID(),
      playerIds: [
        remainingPlayerIds[index],
        remainingPlayerIds[index + 1],
      ],
      locked: false,
    })
  }

  return [
    ...lockedTeams,
    ...randomTeams,
  ]
}

function getNextPowerOfTwo(
  value: number,
) {
  let power = 1

  while (power < value) {
    power *= 2
  }

  return power
}

function createFirstRound(
  teams: Team[],
): Match[] {
  if (teams.length < 2) {
    return []
  }

  const shuffledTeams = shuffle(teams)
  const bracketSize = getNextPowerOfTwo(shuffledTeams.length)
  const matchCount = bracketSize / 2
  const byeCount = bracketSize - shuffledTeams.length
  const competitiveMatchCount = matchCount - byeCount
  const matches: Match[] = []

  let teamIndex = 0

  for (
    let matchIndex = 0;
    matchIndex < competitiveMatchCount;
    matchIndex += 1
  ) {
    const teamA = shuffledTeams[teamIndex]
    const teamB = shuffledTeams[teamIndex + 1]

    matches.push({
      id: crypto.randomUUID(),
      teamAId: teamA.id,
      teamBId: teamB.id,
      winnerTeamId: null,
    })

    teamIndex += 2
  }

  while (teamIndex < shuffledTeams.length) {
    const team = shuffledTeams[teamIndex]

    matches.push({
      id: crypto.randomUUID(),
      teamAId: team.id,
      teamBId: null,
      winnerTeamId: team.id,
    })

    teamIndex += 1
  }

  return shuffle(matches)
}

function createNextRound(
  winnerTeamIds: string[],
): Match[] {
  const matches: Match[] = []

  for (
    let index = 0;
    index < winnerTeamIds.length;
    index += 2
  ) {
    const teamAId = winnerTeamIds[index]
    const teamBId = winnerTeamIds[index + 1] ?? null

    matches.push({
      id: crypto.randomUUID(),
      teamAId,
      teamBId,
      winnerTeamId: teamBId === null ? teamAId : null,
    })
  }

  return matches
}

function getRoundName(
  matches: Match[],
  index: number,
) {
  if (matches.length === 1) {
    return 'Finale'
  }

  if (matches.length === 2) {
    return 'Demi-finales'
  }

  if (matches.length === 4) {
    return 'Quarts de finale'
  }

  return `Tour ${index + 1}`
}

function BeerPong() {
  const { guests } = useGuests()
  const {
    isAdmin,
    loading: authLoading,
  } = useAuth()

  const { identity: partyIdentity } = usePartyIdentity()
  const [state, setState] = useState<BeerPongState>(initialState)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [synchronizationError, setSynchronizationError] = useState('')
  const [swapMessage, setSwapMessage] = useState('')

  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const pendingWritesRef = useRef(0)
  const deferredRefreshRef = useRef(false)
  const loadRequestRef = useRef(0)

  const canManage = isAdmin && !authLoading

  const players = useMemo<Player[]>(() => {
    return guests
      .filter((guest) => guest.status !== 'declined')
      .flatMap((guest) => {
        const guestPlayer: Player = {
          id: `guest:${guest.id}`,
          name: guest.name,
          type: 'guest',
        }

        const plusOnePlayers: Player[] = guest.plusOnes.map(
          (plusOne) => ({
            id: `plus-one:${plusOne.id}`,
            name: plusOne.name.trim() || `+1 de ${guest.name}`,
            type: 'plusOne',
            parentGuestName: guest.name,
          }),
        )

        return [
          guestPlayer,
          ...plusOnePlayers,
        ]
      })
  }, [guests])

  const playerById = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players],
  )

  const displayPlayerById = useMemo(() => {
    const map = new Map<string, Player>()

    for (const player of state.playerSnapshots) {
      map.set(player.id, player)
    }

    for (const player of players) {
      map.set(player.id, player)
    }

    return map
  }, [players, state.playerSnapshots])

  const teamById = useMemo(
    () => new Map(state.teams.map((team) => [team.id, team])),
    [state.teams],
  )

  const loadTournament = useCallback(async () => {
    const requestId = loadRequestRef.current + 1
    loadRequestRef.current = requestId

    const {
      data,
      error: loadError,
    } = await supabase
      .from('beer_pong_state')
      .select('state')
      .eq('id', 'main')
      .maybeSingle()

    if (requestId !== loadRequestRef.current) {
      return
    }

    if (pendingWritesRef.current > 0) {
      deferredRefreshRef.current = true
      return
    }

    if (loadError) {
      console.error('Unable to load Beer Pong:', loadError)
      setSynchronizationError(
        'Impossible de synchroniser le tournoi.',
      )
      setLoading(false)
      return
    }

    if (!data) {
      setState(initialState)
      setSynchronizationError('')
      setLoading(false)
      return
    }

    const row = data as BeerPongRow

    setState(normalizeState(row.state))
    setSynchronizationError('')
    setLoading(false)
  }, [])

  const saveState = useCallback(
    (nextState: BeerPongState) => {
      loadRequestRef.current += 1
      setState(nextState)
      setSynchronizationError('')
      pendingWritesRef.current += 1

      saveQueueRef.current = saveQueueRef.current
        .then(async () => {
          const {
            error: saveError,
          } = await supabase
            .from('beer_pong_state')
            .upsert(
              {
                id: 'main',
                state: nextState,
              },
              {
                onConflict: 'id',
              },
            )

          if (saveError) {
            throw saveError
          }
        })
        .catch(async (saveError) => {
          console.error('Unable to save Beer Pong:', saveError)
          setSynchronizationError(
            'Une modification n’a pas pu être synchronisée.',
          )
          deferredRefreshRef.current = true
        })
        .finally(() => {
          pendingWritesRef.current -= 1

          if (
            pendingWritesRef.current === 0 &&
            deferredRefreshRef.current
          ) {
            deferredRefreshRef.current = false
            void loadTournament()
          }
        })
    },
    [loadTournament],
  )

  useEffect(() => {
    void loadTournament()
  }, [loadTournament])

  useEffect(() => {
    const channel = supabase
      .channel('anniv-2026-beer-pong-live')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'beer_pong_state',
          filter: 'id=eq.main',
        },
        () => {
          if (pendingWritesRef.current > 0) {
            deferredRefreshRef.current = true
            return
          }

          void loadTournament()
        },
      )
      .subscribe()

    const refreshInterval = window.setInterval(() => {
      if (pendingWritesRef.current === 0) {
        void loadTournament()
      }
    }, 15000)

    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        pendingWritesRef.current === 0
      ) {
        void loadTournament()
      }
    }

    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange,
    )

    return () => {
      window.clearInterval(refreshInterval)
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      )
      void supabase.removeChannel(channel)
    }
  }, [loadTournament])

  useEffect(() => {
    if (!swapMessage) {
      return
    }

    const timeout = window.setTimeout(() => {
      setSwapMessage('')
    }, 3500)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [swapMessage])

  const validSelectedPlayerIds = state.selectedPlayerIds.filter(
    (id) => playerById.has(id),
  )

  const selectedCount = canManage
    ? validSelectedPlayerIds.length
    : state.selectedPlayerIds.length

  const lockedTeamCount = state.teams.filter(
    (team) => team.locked,
  ).length

  const getPlayerName = (
    playerId: string,
  ) => {
    return displayPlayerById.get(playerId)?.name ?? 'Joueur inconnu'
  }

  const buildPlayerSnapshots = (
    playerIds: string[],
  ) => {
    return playerIds
      .map((playerId) => playerById.get(playerId))
      .filter((player): player is Player => Boolean(player))
  }

  const validatePlayerSelection = () => {
    if (selectedCount < 4) {
      setError(
        'Il faut au moins 4 joueurs pour créer 2 équipes.',
      )
      return false
    }

    if (selectedCount % 2 !== 0) {
      setError(
        'Il faut un nombre pair de joueurs pour créer des équipes de 2.',
      )
      return false
    }

    return true
  }

  const togglePlayer = (
    playerId: string,
  ) => {
    if (!canManage || state.draftValidated) {
      return
    }

    setError('')
    setSwapMessage('')

    const isSelected = state.selectedPlayerIds.includes(playerId)

    const nextSelectedPlayerIds = isSelected
      ? state.selectedPlayerIds.filter((id) => id !== playerId)
      : [
          ...state.selectedPlayerIds,
          playerId,
        ]

    saveState({
      ...state,
      selectedPlayerIds: nextSelectedPlayerIds,
      playerSnapshots: buildPlayerSnapshots(nextSelectedPlayerIds),
      teams: [],
      draftValidated: false,
      rounds: [],
      championTeamId: null,
    })
  }

  const selectAllPlayers = () => {
    if (!canManage || state.draftValidated) {
      return
    }

    const playerIds = players.map((player) => player.id)

    setError('')
    setSwapMessage('')

    saveState({
      ...state,
      selectedPlayerIds: playerIds,
      playerSnapshots: buildPlayerSnapshots(playerIds),
      teams: [],
      draftValidated: false,
      rounds: [],
      championTeamId: null,
    })
  }

  const clearSelection = () => {
    if (!canManage || state.draftValidated) {
      return
    }

    setError('')
    setSwapMessage('')

    saveState({
      ...initialState,
      draftMode: state.draftMode,
    })
  }

  const switchToRandomMode = () => {
    if (!canManage || state.draftValidated) {
      return
    }

    setError('')
    setSwapMessage('')

    saveState({
      ...state,
      draftMode: 'random',
      draftValidated: false,
      rounds: [],
      championTeamId: null,
    })
  }

  const switchToManualMode = () => {
    if (!canManage || state.draftValidated) {
      return
    }

    setError('')
    setSwapMessage('')

    if (!validatePlayerSelection()) {
      saveState({
        ...state,
        draftMode: 'manual',
        teams: [],
        draftValidated: false,
        rounds: [],
        championTeamId: null,
      })
      return
    }

    const currentTeamPlayerIds = state.teams.flatMap(
      (team) => team.playerIds,
    )

    const currentTeamsAreValid =
      state.teams.length === selectedCount / 2 &&
      currentTeamPlayerIds.length === selectedCount &&
      new Set(currentTeamPlayerIds).size === selectedCount &&
      validSelectedPlayerIds.every(
        (playerId) => currentTeamPlayerIds.includes(playerId),
      )

    saveState({
      ...state,
      draftMode: 'manual',
      teams: currentTeamsAreValid
        ? state.teams
        : createManualTeams(validSelectedPlayerIds),
      draftValidated: false,
      rounds: [],
      championTeamId: null,
    })
  }

  const generateRandomDraft = () => {
    if (!canManage || state.draftValidated) {
      return
    }

    setError('')
    setSwapMessage('')

    if (!validatePlayerSelection()) {
      return
    }

    const teams = createRandomTeams(
      validSelectedPlayerIds,
      state.teams,
    )

    saveState({
      ...state,
      selectedPlayerIds: validSelectedPlayerIds,
      playerSnapshots: buildPlayerSnapshots(validSelectedPlayerIds),
      draftMode: 'random',
      teams,
      draftValidated: false,
      rounds: [],
      championTeamId: null,
    })
  }

  const toggleTeamLock = (
    teamId: string,
  ) => {
    if (!canManage || state.draftValidated) {
      return
    }

    saveState({
      ...state,
      teams: state.teams.map((team) =>
        team.id === teamId
          ? {
              ...team,
              locked: !team.locked,
            }
          : team,
      ),
    })
  }

  const unlockAllTeams = () => {
    if (!canManage || state.draftValidated) {
      return
    }

    saveState({
      ...state,
      teams: state.teams.map((team) => ({
        ...team,
        locked: false,
      })),
    })
  }

  const getPlayerTeamIndex = (
    playerId: string,
  ) => {
    return state.teams.findIndex((team) =>
      team.playerIds.includes(playerId),
    )
  }

  const getPlayerOptionLabel = (
    playerId: string,
    currentTeamId: string,
  ) => {
    const name = getPlayerName(playerId)
    const teamIndex = getPlayerTeamIndex(playerId)

    if (
      teamIndex === -1 ||
      state.teams[teamIndex]?.id === currentTeamId
    ) {
      return name
    }

    return `${name} — Équipe ${teamIndex + 1}`
  }

  const updateManualTeamPlayer = (
    teamId: string,
    slot: 0 | 1,
    newPlayerId: string,
  ) => {
    if (
      !canManage ||
      state.draftValidated ||
      state.draftMode !== 'manual' ||
      !validSelectedPlayerIds.includes(newPlayerId)
    ) {
      return
    }

    const targetTeam = state.teams.find(
      (team) => team.id === teamId,
    )

    if (!targetTeam) {
      return
    }

    const oldPlayerId = targetTeam.playerIds[slot]

    if (oldPlayerId === newPlayerId) {
      return
    }

    const nextTeams = state.teams.map((team) => ({
      ...team,
      playerIds: [
        ...team.playerIds,
      ] as [string, string],
    }))

    let newPlayerTeamIndex = -1
    let newPlayerSlot: 0 | 1 | null = null

    nextTeams.forEach((team, teamIndex) => {
      if (team.playerIds[0] === newPlayerId) {
        newPlayerTeamIndex = teamIndex
        newPlayerSlot = 0
      }

      if (team.playerIds[1] === newPlayerId) {
        newPlayerTeamIndex = teamIndex
        newPlayerSlot = 1
      }
    })

    const targetTeamIndex = nextTeams.findIndex(
      (team) => team.id === teamId,
    )

    if (targetTeamIndex === -1) {
      return
    }

    nextTeams[targetTeamIndex].playerIds[slot] = newPlayerId

    if (
      newPlayerTeamIndex !== -1 &&
      newPlayerSlot !== null
    ) {
      nextTeams[newPlayerTeamIndex].playerIds[newPlayerSlot] = oldPlayerId

      setSwapMessage(
        `${getPlayerName(newPlayerId)} et ${getPlayerName(
          oldPlayerId,
        )} ont été échangés.`,
      )
    }

    saveState({
      ...state,
      teams: nextTeams,
    })
  }

  const validateDraft = () => {
    if (!canManage || !validatePlayerSelection()) {
      return
    }

    if (state.teams.length !== selectedCount / 2) {
      setError(
        'Le nombre d’équipes ne correspond pas aux joueurs sélectionnés.',
      )
      return
    }

    if (
      state.teams.some(
        (team) => team.playerIds[0] === team.playerIds[1],
      )
    ) {
      setError(
        'Une équipe ne peut pas contenir deux fois la même personne.',
      )
      return
    }

    const allPlayers = state.teams.flatMap((team) => team.playerIds)
    const uniquePlayers = new Set(allPlayers)

    if (uniquePlayers.size !== allPlayers.length) {
      setError(
        'Un joueur ne peut pas être présent dans deux équipes.',
      )
      return
    }

    if (
      allPlayers.length !== validSelectedPlayerIds.length ||
      !validSelectedPlayerIds.every((playerId) =>
        uniquePlayers.has(playerId),
      )
    ) {
      setError(
        'Toutes les personnes sélectionnées doivent être présentes exactement une fois dans les équipes.',
      )
      return
    }

    const firstRound = createFirstRound(state.teams)

    if (firstRound.length === 0) {
      setError('Impossible de créer le bracket avec ces équipes.')
      return
    }

    setError('')
    setSwapMessage('')

    saveState({
      ...state,
      draftValidated: true,
      rounds: [firstRound],
      championTeamId: null,
    })
  }

  const clearDraft = () => {
    if (!canManage || state.draftValidated) {
      return
    }

    setError('')
    setSwapMessage('')

    saveState({
      ...state,
      teams: [],
      draftValidated: false,
      rounds: [],
      championTeamId: null,
    })
  }

  const resetTournament = () => {
    if (!canManage) {
      return
    }

    const shouldReset = window.confirm(
      'Réinitialiser complètement le Beer Pong ?',
    )

    if (!shouldReset) {
      return
    }

    setError('')
    setSwapMessage('')
    saveState({
      ...initialState,
    })
  }

  const selectWinner = (
    roundIndex: number,
    matchId: string,
    teamId: string,
  ) => {
    if (!canManage) {
      return
    }

    const round = state.rounds[roundIndex]

    if (!round) {
      return
    }

    const match = round.find(
      (currentMatch) => currentMatch.id === matchId,
    )

    if (
      !match ||
      !match.teamAId ||
      !match.teamBId ||
      (teamId !== match.teamAId && teamId !== match.teamBId) ||
      match.winnerTeamId === teamId
    ) {
      return
    }

    const hasDownstreamResults =
      roundIndex < state.rounds.length - 1 ||
      Boolean(state.championTeamId)

    if (hasDownstreamResults) {
      const shouldCorrect = window.confirm(
        'Corriger ce résultat ? Les tours suivants seront recalculés.',
      )

      if (!shouldCorrect) {
        return
      }
    }

    const updatedRound = round.map((currentMatch) =>
      currentMatch.id === matchId
        ? {
            ...currentMatch,
            winnerTeamId: teamId,
          }
        : currentMatch,
    )

    const nextRounds = [
      ...state.rounds.slice(0, roundIndex),
      updatedRound,
    ]

    let nextChampionTeamId: string | null = null

    const allMatchesCompleted = updatedRound.every(
      (currentMatch) => currentMatch.winnerTeamId !== null,
    )

    if (allMatchesCompleted) {
      const winnerTeamIds = updatedRound
        .map((currentMatch) => currentMatch.winnerTeamId)
        .filter(
          (winnerTeamId): winnerTeamId is string =>
            winnerTeamId !== null,
        )

      if (winnerTeamIds.length === 1) {
        nextChampionTeamId = winnerTeamIds[0]
      } else if (winnerTeamIds.length > 1) {
        nextRounds.push(createNextRound(winnerTeamIds))
      }
    }

    setError('')
    setSwapMessage('')

    saveState({
      ...state,
      rounds: nextRounds,
      championTeamId: nextChampionTeamId,
    })
  }

  const getTeamName = (
    teamId: string | null,
  ) => {
    if (!teamId) {
      return 'Bye'
    }

    const index = state.teams.findIndex(
      (team) => team.id === teamId,
    )

    if (index === -1) {
      return 'Équipe inconnue'
    }

    return `Équipe ${index + 1}`
  }

  const renderTeamPlayers = (
    teamId: string | null,
  ) => {
    if (!teamId) {
      return (
        <span className="beer-match__bye">
          Qualification directe
        </span>
      )
    }

    const team = teamById.get(teamId)

    if (!team) {
      return null
    }

    return (
      <span>
        {getPlayerName(team.playerIds[0])}
        {' & '}
        {getPlayerName(team.playerIds[1])}
      </span>
    )
  }

  const championTeam = state.championTeamId
    ? teamById.get(state.championTeamId)
    : undefined

  if (loading || authLoading) {
    return (
      <main className="beer-page">
        <header className="beer-header">
          <Link
            to="/"
            className="back-link"
          >
            ← Accueil
          </Link>

          <div className="beer-header__content">
            <p className="beer-eyebrow">
              Anniv 2026 / Tournoi
            </p>

            <h1>
              Beer
              <span>Pong</span>
            </h1>

            <p className="beer-header__description">
              Chargement du tournoi...
            </p>
          </div>
        </header>
      </main>
    )
  }

  return (
    <main className="beer-page">
      <div className="beer-page__glow" />

      <header className="beer-header">
        <div className="beer-header__navigation">
          <Link
            to="/"
            className="back-link"
          >
            ← Accueil
          </Link>

          <div className="beer-header__badges">
            <span className="beer-live-pill">
              <span />
              En direct
            </span>

            {canManage && (
              <span className="beer-admin-pill">
                Admin
              </span>
            )}
          </div>
        </div>

        <div className="beer-header__content">
          <p className="beer-eyebrow">
            Anniv 2026 / Tournoi
          </p>

          <h1>
            Beer
            <span>Pong</span>
          </h1>

          <p className="beer-header__description">
            Ton équipe, tes adversaires et les résultats du tournoi.
          </p>
        </div>
      </header>

      {state.draftValidated && partyIdentity && (() => {
        const team = state.teams.find(item => item.playerIds.includes(partyIdentity.playerKey))
        if (!team) return null
        const match = state.rounds.flat().find(item => !item.winnerTeamId && (item.teamAId === team.id || item.teamBId === team.id))
        const opponentId = match && (match.teamAId === team.id ? match.teamBId : match.teamAId)
        const opponent = opponentId ? teamById.get(opponentId) : null
        return <section className="guest-now"><p className="guest-eyebrow">Ton équipe</p><h2>{team.playerIds.map(getPlayerName).join(' & ')}</h2><p>{state.championTeamId === team.id ? 'Vous avez remporté le tournoi !' : match ? opponent ? `Prochain match contre ${opponent.playerIds.map(getPlayerName).join(' & ')}.` : 'Ton prochain adversaire n’est pas encore connu.' : 'Aucun prochain match annoncé pour ton équipe.'}</p></section>
      })()}
      {synchronizationError && (
        <div className="beer-sync-error">
          {synchronizationError}
        </div>
      )}

      {canManage && !state.draftValidated && (
        <>
          <section className="beer-section">
            <div className="beer-section__heading">
              <div>
                <p className="beer-eyebrow">
                  Étape 01
                </p>

                <h2>
                  Choisir les joueurs
                </h2>
              </div>

              <div className="beer-counter">
                <strong>
                  {selectedCount}
                </strong>

                <span>
                  joueur{selectedCount > 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {players.length === 0 ? (
              <div className="beer-empty">
                <strong>
                  Aucun joueur disponible.
                </strong>

                <p>
                  Ajoute d&apos;abord des invités depuis l&apos;administration.
                </p>

                <Link
                  to="/admin/guests"
                  className="beer-link-button"
                >
                  Gérer les invités
                </Link>
              </div>
            ) : (
              <>
                <div className="beer-toolbar">
                  <button
                    type="button"
                    onClick={selectAllPlayers}
                  >
                    Tout sélectionner
                  </button>

                  <button
                    type="button"
                    onClick={clearSelection}
                  >
                    Tout désélectionner
                  </button>
                </div>

                <div className="beer-players">
                  {players.map((player) => {
                    const isSelected = state.selectedPlayerIds.includes(
                      player.id,
                    )

                    return (
                      <button
                        type="button"
                        key={player.id}
                        className={`beer-player ${
                          isSelected
                            ? 'beer-player--selected'
                            : ''
                        }`}
                        aria-pressed={isSelected}
                        onClick={() => togglePlayer(player.id)}
                      >
                        <div className="beer-player__check">
                          {isSelected ? '✓' : ''}
                        </div>

                        <div className="beer-player__avatar">
                          {player.name
                            .charAt(0)
                            .toUpperCase()}
                        </div>

                        <div className="beer-player__identity">
                          <strong>
                            {player.name}
                          </strong>

                          <span>
                            {player.type === 'plusOne'
                              ? `+1 de ${player.parentGuestName}`
                              : 'Invité'}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </section>

          {players.length > 0 && (
            <section className="beer-section">
              <div className="beer-section__heading">
                <div>
                  <p className="beer-eyebrow">
                    Étape 02
                  </p>

                  <h2>
                    La draft
                  </h2>
                </div>

                {state.teams.length > 0 && (
                  <span className="beer-team-count">
                    {state.teams.length} équipes
                  </span>
                )}
              </div>

              <div className="beer-draft-modes">
                <button
                  type="button"
                  className={`beer-draft-mode ${
                    state.draftMode === 'random'
                      ? 'beer-draft-mode--active'
                      : ''
                  }`}
                  aria-pressed={state.draftMode === 'random'}
                  onClick={switchToRandomMode}
                >
                  <span className="beer-draft-mode__icon">
                    ⚡
                  </span>

                  <div>
                    <strong>
                      Draft aléatoire
                    </strong>

                    <span>
                      L&apos;app crée les binômes
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  className={`beer-draft-mode ${
                    state.draftMode === 'manual'
                      ? 'beer-draft-mode--active'
                      : ''
                  }`}
                  aria-pressed={state.draftMode === 'manual'}
                  onClick={switchToManualMode}
                >
                  <span className="beer-draft-mode__icon">
                    ✋
                  </span>

                  <div>
                    <strong>
                      Composer les équipes
                    </strong>

                    <span>
                      Choisis chaque duo
                    </span>
                  </div>
                </button>
              </div>

              {error && (
                <div className="beer-error">
                  {error}
                </div>
              )}

              {swapMessage && (
                <div className="beer-swap-notice">
                  ↔ {swapMessage}
                </div>
              )}

              {state.teams.length === 0 ? (
                <div className="beer-draft-placeholder">
                  <div>
                    <span>
                      2<small>v</small>2
                    </span>

                    <p>
                      Sélectionne un nombre pair de joueurs pour constituer les équipes.
                    </p>
                  </div>

                  {state.draftMode === 'random' && (
                    <button
                      type="button"
                      className="beer-primary-button"
                      onClick={generateRandomDraft}
                    >
                      Générer la draft
                    </button>
                  )}

                  {state.draftMode === 'manual' && (
                    <button
                      type="button"
                      className="beer-primary-button"
                      onClick={switchToManualMode}
                    >
                      Composer les équipes
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {lockedTeamCount > 0 && (
                    <div className="beer-lock-info">
                      <span>
                        🔒 {lockedTeamCount} équipe
                        {lockedTeamCount > 1 ? 's' : ''} verrouillée
                        {lockedTeamCount > 1 ? 's' : ''}
                      </span>

                      <button
                        type="button"
                        onClick={unlockAllTeams}
                      >
                        Tout déverrouiller
                      </button>
                    </div>
                  )}

                  <div className="beer-teams">
                    {state.teams.map((team, index) => (
                      <article
                        key={team.id}
                        className={`beer-team ${
                          team.locked
                            ? 'beer-team--locked'
                            : ''
                        }`}
                      >
                        <div className="beer-team__top">
                          <p>
                            Équipe {index + 1}
                          </p>

                          <button
                            type="button"
                            className={`beer-lock-button ${
                              team.locked
                                ? 'beer-lock-button--active'
                                : ''
                            }`}
                            aria-pressed={team.locked}
                            title={
                              team.locked
                                ? 'Déverrouiller cette équipe'
                                : 'Garder ce duo lors du prochain mélange'
                            }
                            onClick={() => toggleTeamLock(team.id)}
                          >
                            {team.locked ? '🔒' : '🔓'}
                          </button>
                        </div>

                        <div className="beer-team__number">
                          {String(index + 1).padStart(2, '0')}
                        </div>

                        {state.draftMode === 'manual' ? (
                          <div className="beer-team__manual">
                            <select
                              value={team.playerIds[0]}
                              aria-label={`Premier joueur de l’équipe ${index + 1}`}
                              onChange={(event) =>
                                updateManualTeamPlayer(
                                  team.id,
                                  0,
                                  event.target.value,
                                )
                              }
                            >
                              {validSelectedPlayerIds.map((playerId) => (
                                <option
                                  key={playerId}
                                  value={playerId}
                                >
                                  {getPlayerOptionLabel(
                                    playerId,
                                    team.id,
                                  )}
                                </option>
                              ))}
                            </select>

                            <span>
                              +
                            </span>

                            <select
                              value={team.playerIds[1]}
                              aria-label={`Deuxième joueur de l’équipe ${index + 1}`}
                              onChange={(event) =>
                                updateManualTeamPlayer(
                                  team.id,
                                  1,
                                  event.target.value,
                                )
                              }
                            >
                              {validSelectedPlayerIds.map((playerId) => (
                                <option
                                  key={playerId}
                                  value={playerId}
                                >
                                  {getPlayerOptionLabel(
                                    playerId,
                                    team.id,
                                  )}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <div className="beer-team__players">
                            <strong>
                              {getPlayerName(team.playerIds[0])}
                            </strong>

                            <span>
                              +
                            </span>

                            <strong>
                              {getPlayerName(team.playerIds[1])}
                            </strong>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>

                  <div className="beer-draft-actions">
                    {state.draftMode === 'random' && (
                      <button
                        type="button"
                        className="beer-secondary-button"
                        onClick={generateRandomDraft}
                      >
                        ↻ Remélanger
                      </button>
                    )}

                    <button
                      type="button"
                      className="beer-secondary-button"
                      onClick={clearDraft}
                    >
                      Modifier les joueurs
                    </button>

                    <button
                      type="button"
                      className="beer-primary-button"
                      onClick={validateDraft}
                    >
                      Valider les équipes
                    </button>
                  </div>
                </>
              )}
            </section>
          )}
        </>
      )}

      {!canManage && !state.draftValidated && (
        <section className="beer-section">
          <div className="beer-section__heading">
            <div>
              <p className="beer-eyebrow">
                Préparation
              </p>

              <h2>
                Le tournoi arrive
              </h2>
            </div>

            {state.selectedPlayerIds.length > 0 && (
              <div className="beer-counter">
                <strong>
                  {state.selectedPlayerIds.length}
                </strong>

                <span>
                  joueur
                  {state.selectedPlayerIds.length > 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>

          {state.selectedPlayerIds.length === 0 ? (
            <div className="beer-public-waiting">
              <span>◌</span>

              <strong>
                Aucun joueur sélectionné pour l&apos;instant.
              </strong>

              <p>
                La préparation du tournoi apparaîtra ici en direct.
              </p>
            </div>
          ) : (
            <>
              <div className="beer-public-players">
                {state.selectedPlayerIds.map((playerId) => {
                  const player = displayPlayerById.get(playerId)

                  return (
                    <article
                      key={playerId}
                      className="beer-public-player"
                    >
                      <div className="beer-player__avatar">
                        {getPlayerName(playerId)
                          .charAt(0)
                          .toUpperCase()}
                      </div>

                      <div>
                        <strong>
                          {getPlayerName(playerId)}
                        </strong>

                        <span>
                          {player?.type === 'plusOne'
                            ? `+1 de ${player.parentGuestName}`
                            : 'Joueur'}
                        </span>
                      </div>
                    </article>
                  )
                })}
              </div>

              <div className="beer-public-waiting beer-public-waiting--compact">
                <span>⚡</span>

                <strong>
                  Draft en cours
                </strong>

                <p>
                  Les équipes seront révélées dès leur validation.
                </p>
              </div>
            </>
          )}
        </section>
      )}

      {state.draftValidated && (
        <>
          <section className="beer-section">
            <div className="beer-section__heading">
              <div>
                <p className="beer-eyebrow">
                  Équipes
                </p>

                <h2>
                  Draft validée
                </h2>
              </div>

              {canManage && (
                <button
                  type="button"
                  className="beer-reset-button"
                  onClick={resetTournament}
                >
                  Réinitialiser
                </button>
              )}
            </div>

            <div className="beer-teams beer-teams--validated">
              {state.teams.map((team, index) => (
                <article
                  key={team.id}
                  className="beer-team"
                >
                  <div className="beer-team__number beer-team__number--validated">
                    {String(index + 1).padStart(2, '0')}
                  </div>

                  <p>
                    Équipe {index + 1}
                  </p>

                  <div className="beer-team__players">
                    <strong>
                      {getPlayerName(team.playerIds[0])}
                    </strong>

                    <span>
                      +
                    </span>

                    <strong>
                      {getPlayerName(team.playerIds[1])}
                    </strong>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="beer-section">
            <div className="beer-section__heading">
              <div>
                <p className="beer-eyebrow">
                  Tournoi
                </p>

                <h2>
                  Bracket
                </h2>
              </div>

              {!canManage && (
                <span className="beer-readonly-pill">
                  Lecture seule
                </span>
              )}
            </div>

            <div className="beer-bracket">
              {state.rounds.map((round, roundIndex) => {
                const isCurrentRound =
                  roundIndex === state.rounds.length - 1 &&
                  !state.championTeamId

                const isHistoricalRound = !isCurrentRound

                return (
                  <div
                    key={`round-${roundIndex}`}
                    className="beer-round"
                  >
                    <div className="beer-round__title">
                      <span>
                        {String(roundIndex + 1).padStart(2, '0')}
                      </span>

                      <h3>
                        {getRoundName(round, roundIndex)}
                      </h3>
                    </div>

                    <div className="beer-round__matches">
                      {round.map((match) => {
                        const isAutomaticBye =
                          !match.teamAId || !match.teamBId

                        const canEditResult =
                          canManage && !isAutomaticBye

                        const correctionTitle =
                          canEditResult && isHistoricalRound
                            ? 'Corriger ce résultat'
                            : undefined

                        return (
                          <article
                            key={match.id}
                            className="beer-match"
                          >
                            <button
                              type="button"
                              disabled={
                                !canEditResult || !match.teamAId
                              }
                              aria-pressed={
                                match.winnerTeamId === match.teamAId
                              }
                              title={correctionTitle}
                              className={`beer-match__team ${
                                match.winnerTeamId === match.teamAId
                                  ? 'beer-match__team--winner'
                                  : ''
                              }`}
                              onClick={() => {
                                if (match.teamAId) {
                                  selectWinner(
                                    roundIndex,
                                    match.id,
                                    match.teamAId,
                                  )
                                }
                              }}
                            >
                              <div>
                                <strong>
                                  {getTeamName(match.teamAId)}
                                </strong>

                                {renderTeamPlayers(match.teamAId)}
                              </div>

                              {match.winnerTeamId === match.teamAId &&
                                match.teamAId && (
                                  <span className="beer-match__winner-icon">
                                    ✓
                                  </span>
                                )}
                            </button>

                            <div className="beer-match__versus">
                              VS
                            </div>

                            <button
                              type="button"
                              disabled={
                                !canEditResult || !match.teamBId
                              }
                              aria-pressed={
                                match.winnerTeamId === match.teamBId
                              }
                              title={correctionTitle}
                              className={`beer-match__team ${
                                match.winnerTeamId === match.teamBId
                                  ? 'beer-match__team--winner'
                                  : ''
                              }`}
                              onClick={() => {
                                if (match.teamBId) {
                                  selectWinner(
                                    roundIndex,
                                    match.id,
                                    match.teamBId,
                                  )
                                }
                              }}
                            >
                              <div>
                                <strong>
                                  {getTeamName(match.teamBId)}
                                </strong>

                                {renderTeamPlayers(match.teamBId)}
                              </div>

                              {match.winnerTeamId === match.teamBId &&
                                match.teamBId && (
                                  <span className="beer-match__winner-icon">
                                    ✓
                                  </span>
                                )}
                            </button>
                          </article>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </>
      )}

      {championTeam && state.championTeamId && (
        <section className="beer-champion">
          <p className="beer-eyebrow">
            Champions 2026
          </p>

          <div className="beer-champion__trophy">
            🏆
          </div>

          <h2>
            {getTeamName(state.championTeamId)}
          </h2>

          <p>
            {getPlayerName(championTeam.playerIds[0])}
            <span>&</span>
            {getPlayerName(championTeam.playerIds[1])}
          </p>

          {canManage && (
            <button
              type="button"
              className="beer-secondary-button"
              onClick={resetTournament}
            >
              Nouveau tournoi
            </button>
          )}
        </section>
      )}
    </main>
  )
}

export default BeerPong
