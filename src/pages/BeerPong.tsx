import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../features/auth/AuthContext'
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
  updated_at: string
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

function normalizeState(
  value: unknown,
): BeerPongState {
  if (
    !value ||
    typeof value !== 'object'
  ) {
    return initialState
  }

  const parsed =
    value as Partial<BeerPongState>

  return {
    selectedPlayerIds:
      Array.isArray(
        parsed.selectedPlayerIds,
      )
        ? parsed.selectedPlayerIds
        : [],

    playerSnapshots:
      Array.isArray(
        parsed.playerSnapshots,
      )
        ? parsed.playerSnapshots
        : [],

    teams: Array.isArray(parsed.teams)
      ? parsed.teams.map((team) => ({
          ...team,
          locked: team.locked ?? false,
        }))
      : [],

    draftMode:
      parsed.draftMode === 'manual'
        ? 'manual'
        : 'random',

    draftValidated:
      parsed.draftValidated ?? false,

    rounds: Array.isArray(parsed.rounds)
      ? parsed.rounds
      : [],

    championTeamId:
      parsed.championTeamId ?? null,
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

    const temporary =
      shuffled[index]

    shuffled[index] =
      shuffled[randomIndex]

    shuffled[randomIndex] =
      temporary
  }

  return shuffled
}

function createManualTeams(
  playerIds: string[],
): Team[] {
  const teams: Team[] = []

  for (
    let index = 0;
    index < playerIds.length;
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
  const selectedPlayerSet =
    new Set(playerIds)

  const lockedTeams =
    currentTeams.filter(
      (team) =>
        team.locked &&
        selectedPlayerSet.has(
          team.playerIds[0],
        ) &&
        selectedPlayerSet.has(
          team.playerIds[1],
        ),
    )

  const lockedPlayerIds =
    new Set(
      lockedTeams.flatMap(
        (team) => team.playerIds,
      ),
    )

  const remainingPlayerIds =
    shuffle(
      playerIds.filter(
        (playerId) =>
          !lockedPlayerIds.has(
            playerId,
          ),
      ),
    )

  const randomTeams: Team[] = []

  for (
    let index = 0;
    index <
    remainingPlayerIds.length;
    index += 2
  ) {
    randomTeams.push({
      id: crypto.randomUUID(),

      playerIds: [
        remainingPlayerIds[index],
        remainingPlayerIds[
          index + 1
        ],
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
  const shuffledTeams =
    shuffle(teams)

  const bracketSize =
    getNextPowerOfTwo(
      shuffledTeams.length,
    )

  const matchCount =
    bracketSize / 2

  const byeCount =
    bracketSize -
    shuffledTeams.length

  const competitiveMatchCount =
    matchCount - byeCount

  const matches: Match[] = []

  let teamIndex = 0

  for (
    let matchIndex = 0;
    matchIndex <
    competitiveMatchCount;
    matchIndex += 1
  ) {
    const teamA =
      shuffledTeams[teamIndex]

    const teamB =
      shuffledTeams[
        teamIndex + 1
      ]

    matches.push({
      id: crypto.randomUUID(),

      teamAId: teamA.id,
      teamBId: teamB.id,

      winnerTeamId: null,
    })

    teamIndex += 2
  }

  while (
    teamIndex <
    shuffledTeams.length
  ) {
    const team =
      shuffledTeams[teamIndex]

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
    const teamAId =
      winnerTeamIds[index]

    const teamBId =
      winnerTeamIds[
        index + 1
      ] ?? null

    matches.push({
      id: crypto.randomUUID(),

      teamAId,
      teamBId,

      winnerTeamId:
        teamBId === null
          ? teamAId
          : null,
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

  const [state, setState] =
    useState<BeerPongState>(
      initialState,
    )

  const [loading, setLoading] =
    useState(true)

  const [error, setError] =
    useState('')

  const [
    synchronizationError,
    setSynchronizationError,
  ] = useState('')

  const [
    swapMessage,
    setSwapMessage,
  ] = useState('')

  const saveQueueRef =
    useRef<Promise<void>>(
      Promise.resolve(),
    )

  const pendingWritesRef =
    useRef(0)

  const deferredRefreshRef =
    useRef(false)

  const canManage =
    isAdmin && !authLoading

  const players =
    useMemo<Player[]>(() => {
      return guests
        .filter(
          (guest) =>
            guest.status !==
            'declined',
        )
        .flatMap((guest) => {
          const guestPlayer: Player =
            {
              id: `guest:${guest.id}`,
              name: guest.name,
              type: 'guest',
            }

          const plusOnePlayers:
            Player[] =
            guest.plusOnes.map(
              (plusOne) => ({
                id: `plus-one:${plusOne.id}`,

                name:
                  plusOne.name.trim() ||
                  `+1 de ${guest.name}`,

                type: 'plusOne',

                parentGuestName:
                  guest.name,
              }),
            )

          return [
            guestPlayer,
            ...plusOnePlayers,
          ]
        })
    }, [guests])

  const playerById = useMemo(
    () =>
      new Map(
        players.map((player) => [
          player.id,
          player,
        ]),
      ),
    [players],
  )

  const displayPlayerById =
    useMemo(() => {
      const map =
        new Map<string, Player>()

      for (
        const player of
        state.playerSnapshots
      ) {
        map.set(
          player.id,
          player,
        )
      }

      for (const player of players) {
        map.set(
          player.id,
          player,
        )
      }

      return map
    }, [
      players,
      state.playerSnapshots,
    ])

  const teamById = useMemo(
    () =>
      new Map(
        state.teams.map((team) => [
          team.id,
          team,
        ]),
      ),
    [state.teams],
  )

  const loadTournament =
    useCallback(async () => {
      const {
        data,
        error:
          loadError,
      } = await supabase
        .from('beer_pong_state')
        .select(
          'state, updated_at',
        )
        .eq('id', 'main')
        .maybeSingle()

      if (loadError) {
        console.error(
          'Unable to load Beer Pong:',
          loadError,
        )

        setSynchronizationError(
          'Impossible de synchroniser le tournoi.',
        )

        setLoading(false)

        return
      }

      if (!data) {
        setState(initialState)
        setLoading(false)

        return
      }

      const row =
        data as BeerPongRow

      setState(
        normalizeState(row.state),
      )

      setSynchronizationError('')
      setLoading(false)
    }, [])

  const saveState =
    useCallback(
      (
        nextState:
          BeerPongState,
      ) => {
        setState(nextState)

        setSynchronizationError('')

        pendingWritesRef.current += 1

        saveQueueRef.current =
          saveQueueRef.current
            .then(async () => {
              const {
                error:
                  saveError,
              } = await supabase
                .from(
                  'beer_pong_state',
                )
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
            .catch(
              async (
                saveError,
              ) => {
                console.error(
                  'Unable to save Beer Pong:',
                  saveError,
                )

                setSynchronizationError(
                  'Une modification n’a pas pu être synchronisée.',
                )

                deferredRefreshRef.current =
                  true
              },
            )
            .finally(() => {
              pendingWritesRef.current -=
                1

              if (
                pendingWritesRef.current ===
                  0 &&
                deferredRefreshRef.current
              ) {
                deferredRefreshRef.current =
                  false

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
      .channel(
        'anniv-2026-beer-pong-live',
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table:
            'beer_pong_state',
          filter: 'id=eq.main',
        },
        () => {
          if (
            pendingWritesRef.current >
            0
          ) {
            deferredRefreshRef.current =
              true

            return
          }

          void loadTournament()
        },
      )
      .subscribe()

    const refreshInterval =
      window.setInterval(() => {
        if (
          pendingWritesRef.current ===
          0
        ) {
          void loadTournament()
        }
      }, 15000)

    const handleVisibilityChange =
      () => {
        if (
          document.visibilityState ===
            'visible' &&
          pendingWritesRef.current ===
            0
        ) {
          void loadTournament()
        }
      }

    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange,
    )

    return () => {
      window.clearInterval(
        refreshInterval,
      )

      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      )

      void supabase.removeChannel(
        channel,
      )
    }
  }, [loadTournament])

  useEffect(() => {
    if (!swapMessage) {
      return
    }

    const timeout =
      window.setTimeout(() => {
        setSwapMessage('')
      }, 3500)

    return () => {
      window.clearTimeout(
        timeout,
      )
    }
  }, [swapMessage])

  const validSelectedPlayerIds =
    state.selectedPlayerIds.filter(
      (id) =>
        playerById.has(id),
    )

  const selectedCount =
    canManage
      ? validSelectedPlayerIds.length
      : state.selectedPlayerIds
          .length

  const lockedTeamCount =
    state.teams.filter(
      (team) => team.locked,
    ).length

  const getPlayerName = (
    playerId: string,
  ) => {
    return (
      displayPlayerById.get(
        playerId,
      )?.name ??
      'Joueur inconnu'
    )
  }

  const buildPlayerSnapshots =
    (playerIds: string[]) => {
      return playerIds
        .map(
          (playerId) =>
            playerById.get(
              playerId,
            ),
        )
        .filter(
          (
            player,
          ): player is Player =>
            Boolean(player),
        )
    }

  const validatePlayerSelection =
    () => {
      if (selectedCount < 4) {
        setError(
          'Il faut au moins 4 joueurs pour créer 2 équipes.',
        )

        return false
      }

      if (
        selectedCount % 2 !==
        0
      ) {
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
    if (
      !canManage ||
      state.draftValidated
    ) {
      return
    }

    setError('')
    setSwapMessage('')

    const isSelected =
      state.selectedPlayerIds.includes(
        playerId,
      )

    const nextSelectedPlayerIds =
      isSelected
        ? state.selectedPlayerIds.filter(
            (id) =>
              id !== playerId,
          )
        : [
            ...state.selectedPlayerIds,
            playerId,
          ]

    saveState({
      ...state,

      selectedPlayerIds:
        nextSelectedPlayerIds,

      playerSnapshots:
        buildPlayerSnapshots(
          nextSelectedPlayerIds,
        ),

      teams: [],
      rounds: [],
      championTeamId: null,
    })
  }

  const selectAllPlayers = () => {
    if (
      !canManage ||
      state.draftValidated
    ) {
      return
    }

    const playerIds =
      players.map(
        (player) =>
          player.id,
      )

    setError('')
    setSwapMessage('')

    saveState({
      ...state,

      selectedPlayerIds:
        playerIds,

      playerSnapshots:
        buildPlayerSnapshots(
          playerIds,
        ),

      teams: [],
      rounds: [],
      championTeamId: null,
    })
  }

  const clearSelection = () => {
    if (
      !canManage ||
      state.draftValidated
    ) {
      return
    }

    setError('')
    setSwapMessage('')

    saveState({
      ...initialState,
      draftMode:
        state.draftMode,
    })
  }

  const switchToRandomMode =
    () => {
      if (!canManage) {
        return
      }

      setError('')
      setSwapMessage('')

      saveState({
        ...state,

        draftMode: 'random',

        rounds: [],
        championTeamId: null,
      })
    }

  const switchToManualMode =
    () => {
      if (!canManage) {
        return
      }

      setError('')
      setSwapMessage('')

      if (
        !validatePlayerSelection()
      ) {
        saveState({
          ...state,
          draftMode: 'manual',
          teams: [],
        })

        return
      }

      const currentTeamPlayerIds =
        state.teams.flatMap(
          (team) =>
            team.playerIds,
        )

      const currentTeamsAreValid =
        state.teams.length ===
          selectedCount / 2 &&
        currentTeamPlayerIds.length ===
          selectedCount &&
        validSelectedPlayerIds.every(
          (playerId) =>
            currentTeamPlayerIds.includes(
              playerId,
            ),
        )

      saveState({
        ...state,

        draftMode: 'manual',

        teams:
          currentTeamsAreValid
            ? state.teams
            : createManualTeams(
                validSelectedPlayerIds,
              ),

        rounds: [],
        championTeamId: null,
      })
    }

  const generateRandomDraft =
    () => {
      if (!canManage) {
        return
      }

      setError('')
      setSwapMessage('')

      if (
        !validatePlayerSelection()
      ) {
        return
      }

      const teams =
        createRandomTeams(
          validSelectedPlayerIds,
          state.teams,
        )

      saveState({
        ...state,

        selectedPlayerIds:
          validSelectedPlayerIds,

        playerSnapshots:
          buildPlayerSnapshots(
            validSelectedPlayerIds,
          ),

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
    if (
      !canManage ||
      state.draftValidated
    ) {
      return
    }

    saveState({
      ...state,

      teams: state.teams.map(
        (team) =>
          team.id === teamId
            ? {
                ...team,
                locked:
                  !team.locked,
              }
            : team,
      ),
    })
  }

  const unlockAllTeams =
    () => {
      if (!canManage) {
        return
      }

      saveState({
        ...state,

        teams: state.teams.map(
          (team) => ({
            ...team,
            locked: false,
          }),
        ),
      })
    }

  const getPlayerTeamIndex =
    (playerId: string) => {
      return state.teams.findIndex(
        (team) =>
          team.playerIds.includes(
            playerId,
          ),
      )
    }

  const getPlayerOptionLabel =
    (
      playerId: string,
      currentTeamId: string,
    ) => {
      const name =
        getPlayerName(
          playerId,
        )

      const teamIndex =
        getPlayerTeamIndex(
          playerId,
        )

      if (
        teamIndex === -1 ||
        state.teams[
          teamIndex
        ]?.id === currentTeamId
      ) {
        return name
      }

      return `${name} — Équipe ${
        teamIndex + 1
      }`
    }

  const updateManualTeamPlayer =
    (
      teamId: string,
      slot: 0 | 1,
      newPlayerId: string,
    ) => {
      if (!canManage) {
        return
      }

      const targetTeam =
        state.teams.find(
          (team) =>
            team.id === teamId,
        )

      if (!targetTeam) {
        return
      }

      const oldPlayerId =
        targetTeam.playerIds[
          slot
        ]

      if (
        oldPlayerId ===
        newPlayerId
      ) {
        return
      }

      const nextTeams =
        state.teams.map(
          (team) => ({
            ...team,

            playerIds: [
              ...team.playerIds,
            ] as [
              string,
              string,
            ],
          }),
        )

      let newPlayerTeamIndex =
        -1

      let newPlayerSlot:
        | 0
        | 1
        | null = null

      nextTeams.forEach(
        (
          team,
          teamIndex,
        ) => {
          if (
            team.playerIds[0] ===
            newPlayerId
          ) {
            newPlayerTeamIndex =
              teamIndex

            newPlayerSlot = 0
          }

          if (
            team.playerIds[1] ===
            newPlayerId
          ) {
            newPlayerTeamIndex =
              teamIndex

            newPlayerSlot = 1
          }
        },
      )

      const targetTeamIndex =
        nextTeams.findIndex(
          (team) =>
            team.id === teamId,
        )

      if (
        targetTeamIndex === -1
      ) {
        return
      }

      nextTeams[
        targetTeamIndex
      ].playerIds[slot] =
        newPlayerId

      if (
        newPlayerTeamIndex !==
          -1 &&
        newPlayerSlot !== null
      ) {
        nextTeams[
          newPlayerTeamIndex
        ].playerIds[
          newPlayerSlot
        ] = oldPlayerId

        setSwapMessage(
          `${getPlayerName(
            newPlayerId,
          )} et ${getPlayerName(
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
    if (!canManage) {
      return
    }

    if (
      state.teams.length < 2
    ) {
      return
    }

    const allPlayers =
      state.teams.flatMap(
        (team) =>
          team.playerIds,
      )

    const uniquePlayers =
      new Set(allPlayers)

    if (
      uniquePlayers.size !==
      allPlayers.length
    ) {
      setError(
        'Un joueur ne peut pas être présent dans deux équipes.',
      )

      return
    }

    if (
      allPlayers.length !==
      validSelectedPlayerIds.length ||
      !validSelectedPlayerIds.every(
        (playerId) =>
          uniquePlayers.has(
            playerId,
          ),
      )
    ) {
      setError(
        'Toutes les personnes sélectionnées doivent être présentes exactement une fois dans les équipes.',
      )

      return
    }

    const firstRound =
      createFirstRound(
        state.teams,
      )

    setError('')
    setSwapMessage('')

    saveState({
      ...state,

      draftValidated: true,

      rounds: [
        firstRound,
      ],

      championTeamId: null,
    })
  }

  const clearDraft = () => {
    if (!canManage) {
      return
    }

    setError('')
    setSwapMessage('')

    saveState({
      ...state,

      teams: [],
      rounds: [],
      championTeamId: null,
    })
  }

  const resetTournament =
    () => {
      if (!canManage) {
        return
      }

      const shouldReset =
        window.confirm(
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
    matchId: string,
    teamId: string,
  ) => {
    if (
      !canManage ||
      state.championTeamId
    ) {
      return
    }

    const lastRoundIndex =
      state.rounds.length - 1

    const lastRound =
      state.rounds[
        lastRoundIndex
      ]

    if (!lastRound) {
      return
    }

    const nextLastRound =
      lastRound.map(
        (match) =>
          match.id ===
          matchId
            ? {
                ...match,

                winnerTeamId:
                  teamId,
              }
            : match,
      )

    const nextRounds = [
      ...state.rounds.slice(
        0,
        lastRoundIndex,
      ),

      nextLastRound,
    ]

    const allMatchesCompleted =
      nextLastRound.every(
        (match) =>
          match.winnerTeamId,
      )

    if (
      !allMatchesCompleted
    ) {
      saveState({
        ...state,
        rounds: nextRounds,
      })

      return
    }

    const winnerTeamIds =
      nextLastRound
        .map(
          (match) =>
            match.winnerTeamId,
        )
        .filter(
          (
            winnerTeamId,
          ): winnerTeamId is string =>
            winnerTeamId !== null,
        )

    if (
      winnerTeamIds.length ===
      1
    ) {
      saveState({
        ...state,

        rounds: nextRounds,

        championTeamId:
          winnerTeamIds[0],
      })

      return
    }

    const nextRound =
      createNextRound(
        winnerTeamIds,
      )

    saveState({
      ...state,

      rounds: [
        ...nextRounds,
        nextRound,
      ],
    })
  }

  const getTeamName = (
    teamId: string | null,
  ) => {
    if (!teamId) {
      return 'Bye'
    }

    const index =
      state.teams.findIndex(
        (team) =>
          team.id === teamId,
      )

    if (index === -1) {
      return 'Équipe inconnue'
    }

    return `Équipe ${index + 1}`
  }

  const renderTeamPlayers =
    (
      teamId: string | null,
    ) => {
      if (!teamId) {
        return (
          <span className="beer-match__bye">
            Qualification directe
          </span>
        )
      }

      const team =
        teamById.get(teamId)

      if (!team) {
        return null
      }

      return (
        <span>
          {getPlayerName(
            team.playerIds[0],
          )}
          {' & '}
          {getPlayerName(
            team.playerIds[1],
          )}
        </span>
      )
    }

  const championTeam =
    state.championTeamId
      ? teamById.get(
          state.championTeamId,
        )
      : undefined

  if (loading) {
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
            Équipes de 2, draft libre et
            élimination directe.
          </p>
        </div>
      </header>

      {synchronizationError && (
        <div className="beer-sync-error">
          {synchronizationError}
        </div>
      )}

      {canManage &&
        !state.draftValidated && (
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
                    joueur
                    {selectedCount >
                    1
                      ? 's'
                      : ''}
                  </span>
                </div>
              </div>

              {players.length === 0 ? (
                <div className="beer-empty">
                  <strong>
                    Aucun joueur
                    disponible.
                  </strong>

                  <p>
                    Ajoute d&apos;abord
                    des invités depuis
                    l&apos;administration.
                  </p>

                  <Link
                    to="/admin"
                    className="beer-link-button"
                  >
                    Ouvrir
                    l&apos;admin
                  </Link>
                </div>
              ) : (
                <>
                  <div className="beer-toolbar">
                    <button
                      type="button"
                      onClick={
                        selectAllPlayers
                      }
                    >
                      Tout sélectionner
                    </button>

                    <button
                      type="button"
                      onClick={
                        clearSelection
                      }
                    >
                      Tout désélectionner
                    </button>
                  </div>

                  <div className="beer-players">
                    {players.map(
                      (player) => {
                        const isSelected =
                          state.selectedPlayerIds.includes(
                            player.id,
                          )

                        return (
                          <button
                            type="button"
                            key={
                              player.id
                            }
                            className={`beer-player ${
                              isSelected
                                ? 'beer-player--selected'
                                : ''
                            }`}
                            onClick={() =>
                              togglePlayer(
                                player.id,
                              )
                            }
                          >
                            <div className="beer-player__check">
                              {isSelected
                                ? '✓'
                                : ''}
                            </div>

                            <div className="beer-player__avatar">
                              {player.name
                                .charAt(
                                  0,
                                )
                                .toUpperCase()}
                            </div>

                            <div className="beer-player__identity">
                              <strong>
                                {
                                  player.name
                                }
                              </strong>

                              <span>
                                {player.type ===
                                'plusOne'
                                  ? `+1 de ${player.parentGuestName}`
                                  : 'Invité'}
                              </span>
                            </div>
                          </button>
                        )
                      },
                    )}
                  </div>
                </>
              )}
            </section>

            {players.length >
              0 && (
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

                  {state.teams
                    .length >
                    0 && (
                    <span className="beer-team-count">
                      {
                        state.teams
                          .length
                      }{' '}
                      équipes
                    </span>
                  )}
                </div>

                <div className="beer-draft-modes">
                  <button
                    type="button"
                    className={`beer-draft-mode ${
                      state.draftMode ===
                      'random'
                        ? 'beer-draft-mode--active'
                        : ''
                    }`}
                    onClick={
                      switchToRandomMode
                    }
                  >
                    <span className="beer-draft-mode__icon">
                      ⚡
                    </span>

                    <div>
                      <strong>
                        Draft aléatoire
                      </strong>

                      <span>
                        L&apos;app crée
                        les binômes
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    className={`beer-draft-mode ${
                      state.draftMode ===
                      'manual'
                        ? 'beer-draft-mode--active'
                        : ''
                    }`}
                    onClick={
                      switchToManualMode
                    }
                  >
                    <span className="beer-draft-mode__icon">
                      ✋
                    </span>

                    <div>
                      <strong>
                        Composer les
                        équipes
                      </strong>

                      <span>
                        Choisis chaque
                        duo
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

                {state.teams
                  .length === 0 ? (
                  <div className="beer-draft-placeholder">
                    <div>
                      <span>
                        2
                        <small>
                          v
                        </small>
                        2
                      </span>

                      <p>
                        Sélectionne un
                        nombre pair de
                        joueurs pour
                        constituer les
                        équipes.
                      </p>
                    </div>

                    {state.draftMode ===
                      'random' && (
                      <button
                        type="button"
                        className="beer-primary-button"
                        onClick={
                          generateRandomDraft
                        }
                      >
                        Générer la
                        draft
                      </button>
                    )}

                    {state.draftMode ===
                      'manual' && (
                      <button
                        type="button"
                        className="beer-primary-button"
                        onClick={
                          switchToManualMode
                        }
                      >
                        Composer les
                        équipes
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {lockedTeamCount >
                      0 && (
                      <div className="beer-lock-info">
                        <span>
                          🔒{' '}
                          {
                            lockedTeamCount
                          }{' '}
                          équipe
                          {lockedTeamCount >
                          1
                            ? 's'
                            : ''}{' '}
                          verrouillée
                          {lockedTeamCount >
                          1
                            ? 's'
                            : ''}
                        </span>

                        <button
                          type="button"
                          onClick={
                            unlockAllTeams
                          }
                        >
                          Tout
                          déverrouiller
                        </button>
                      </div>
                    )}

                    <div className="beer-teams">
                      {state.teams.map(
                        (
                          team,
                          index,
                        ) => (
                          <article
                            key={
                              team.id
                            }
                            className={`beer-team ${
                              team.locked
                                ? 'beer-team--locked'
                                : ''
                            }`}
                          >
                            <div className="beer-team__top">
                              <p>
                                Équipe{' '}
                                {index +
                                  1}
                              </p>

                              <button
                                type="button"
                                className={`beer-lock-button ${
                                  team.locked
                                    ? 'beer-lock-button--active'
                                    : ''
                                }`}
                                title={
                                  team.locked
                                    ? 'Déverrouiller cette équipe'
                                    : 'Garder ce duo lors du prochain mélange'
                                }
                                onClick={() =>
                                  toggleTeamLock(
                                    team.id,
                                  )
                                }
                              >
                                {team.locked
                                  ? '🔒'
                                  : '🔓'}
                              </button>
                            </div>

                            <div className="beer-team__number">
                              {String(
                                index +
                                  1,
                              ).padStart(
                                2,
                                '0',
                              )}
                            </div>

                            {state.draftMode ===
                            'manual' ? (
                              <div className="beer-team__manual">
                                <select
                                  value={
                                    team
                                      .playerIds[0]
                                  }
                                  onChange={(
                                    event,
                                  ) =>
                                    updateManualTeamPlayer(
                                      team.id,
                                      0,
                                      event
                                        .target
                                        .value,
                                    )
                                  }
                                >
                                  {validSelectedPlayerIds.map(
                                    (
                                      playerId,
                                    ) => (
                                      <option
                                        key={
                                          playerId
                                        }
                                        value={
                                          playerId
                                        }
                                      >
                                        {getPlayerOptionLabel(
                                          playerId,
                                          team.id,
                                        )}
                                      </option>
                                    ),
                                  )}
                                </select>

                                <span>
                                  +
                                </span>

                                <select
                                  value={
                                    team
                                      .playerIds[1]
                                  }
                                  onChange={(
                                    event,
                                  ) =>
                                    updateManualTeamPlayer(
                                      team.id,
                                      1,
                                      event
                                        .target
                                        .value,
                                    )
                                  }
                                >
                                  {validSelectedPlayerIds.map(
                                    (
                                      playerId,
                                    ) => (
                                      <option
                                        key={
                                          playerId
                                        }
                                        value={
                                          playerId
                                        }
                                      >
                                        {getPlayerOptionLabel(
                                          playerId,
                                          team.id,
                                        )}
                                      </option>
                                    ),
                                  )}
                                </select>
                              </div>
                            ) : (
                              <div className="beer-team__players">
                                <strong>
                                  {getPlayerName(
                                    team
                                      .playerIds[0],
                                  )}
                                </strong>

                                <span>
                                  +
                                </span>

                                <strong>
                                  {getPlayerName(
                                    team
                                      .playerIds[1],
                                  )}
                                </strong>
                              </div>
                            )}
                          </article>
                        ),
                      )}
                    </div>

                    <div className="beer-draft-actions">
                      {state.draftMode ===
                        'random' && (
                        <button
                          type="button"
                          className="beer-secondary-button"
                          onClick={
                            generateRandomDraft
                          }
                        >
                          ↻ Remélanger
                        </button>
                      )}

                      <button
                        type="button"
                        className="beer-secondary-button"
                        onClick={
                          clearDraft
                        }
                      >
                        Modifier les
                        joueurs
                      </button>

                      <button
                        type="button"
                        className="beer-primary-button"
                        onClick={
                          validateDraft
                        }
                      >
                        Valider les
                        équipes
                      </button>
                    </div>
                  </>
                )}
              </section>
            )}
          </>
        )}

      {!canManage &&
        !state.draftValidated && (
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

              {state.selectedPlayerIds
                .length > 0 && (
                <div className="beer-counter">
                  <strong>
                    {
                      state
                        .selectedPlayerIds
                        .length
                    }
                  </strong>

                  <span>
                    joueur
                    {state
                      .selectedPlayerIds
                      .length > 1
                      ? 's'
                      : ''}
                  </span>
                </div>
              )}
            </div>

            {state.selectedPlayerIds
              .length === 0 ? (
              <div className="beer-public-waiting">
                <span>◌</span>

                <strong>
                  Aucun joueur
                  sélectionné pour
                  l&apos;instant.
                </strong>

                <p>
                  La préparation du
                  tournoi apparaîtra
                  ici en direct.
                </p>
              </div>
            ) : (
              <>
                <div className="beer-public-players">
                  {state.selectedPlayerIds.map(
                    (playerId) => {
                      const player =
                        displayPlayerById.get(
                          playerId,
                        )

                      return (
                        <article
                          key={
                            playerId
                          }
                          className="beer-public-player"
                        >
                          <div className="beer-player__avatar">
                            {getPlayerName(
                              playerId,
                            )
                              .charAt(
                                0,
                              )
                              .toUpperCase()}
                          </div>

                          <div>
                            <strong>
                              {getPlayerName(
                                playerId,
                              )}
                            </strong>

                            <span>
                              {player?.type ===
                              'plusOne'
                                ? `+1 de ${player.parentGuestName}`
                                : 'Joueur'}
                            </span>
                          </div>
                        </article>
                      )
                    },
                  )}
                </div>

                <div className="beer-public-waiting beer-public-waiting--compact">
                  <span>⚡</span>

                  <strong>
                    Draft en cours
                  </strong>

                  <p>
                    Les équipes seront
                    révélées dès leur
                    validation.
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
                  onClick={
                    resetTournament
                  }
                >
                  Réinitialiser
                </button>
              )}
            </div>

            <div className="beer-teams beer-teams--validated">
              {state.teams.map(
                (
                  team,
                  index,
                ) => (
                  <article
                    key={team.id}
                    className="beer-team"
                  >
                    <div className="beer-team__number beer-team__number--validated">
                      {String(
                        index + 1,
                      ).padStart(
                        2,
                        '0',
                      )}
                    </div>

                    <p>
                      Équipe{' '}
                      {index + 1}
                    </p>

                    <div className="beer-team__players">
                      <strong>
                        {getPlayerName(
                          team
                            .playerIds[0],
                        )}
                      </strong>

                      <span>
                        +
                      </span>

                      <strong>
                        {getPlayerName(
                          team
                            .playerIds[1],
                        )}
                      </strong>
                    </div>
                  </article>
                ),
              )}
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
              {state.rounds.map(
                (
                  round,
                  roundIndex,
                ) => {
                  const isCurrentRound =
                    roundIndex ===
                      state.rounds
                        .length -
                        1 &&
                    !state.championTeamId

                  return (
                    <div
                      key={`round-${roundIndex}`}
                      className="beer-round"
                    >
                      <div className="beer-round__title">
                        <span>
                          {String(
                            roundIndex +
                              1,
                          ).padStart(
                            2,
                            '0',
                          )}
                        </span>

                        <h3>
                          {getRoundName(
                            round,
                            roundIndex,
                          )}
                        </h3>
                      </div>

                      <div className="beer-round__matches">
                        {round.map(
                          (
                            match,
                          ) => (
                            <article
                              key={
                                match.id
                              }
                              className="beer-match"
                            >
                              <button
                                type="button"
                                disabled={
                                  !canManage ||
                                  !match.teamAId ||
                                  !isCurrentRound ||
                                  Boolean(
                                    state.championTeamId,
                                  )
                                }
                                className={`beer-match__team ${
                                  match.winnerTeamId ===
                                  match.teamAId
                                    ? 'beer-match__team--winner'
                                    : ''
                                }`}
                                onClick={() => {
                                  if (
                                    match.teamAId
                                  ) {
                                    selectWinner(
                                      match.id,
                                      match.teamAId,
                                    )
                                  }
                                }}
                              >
                                <div>
                                  <strong>
                                    {getTeamName(
                                      match.teamAId,
                                    )}
                                  </strong>

                                  {renderTeamPlayers(
                                    match.teamAId,
                                  )}
                                </div>

                                {match.winnerTeamId ===
                                  match.teamAId &&
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
                                  !canManage ||
                                  !match.teamBId ||
                                  !isCurrentRound ||
                                  Boolean(
                                    state.championTeamId,
                                  )
                                }
                                className={`beer-match__team ${
                                  match.winnerTeamId ===
                                  match.teamBId
                                    ? 'beer-match__team--winner'
                                    : ''
                                }`}
                                onClick={() => {
                                  if (
                                    match.teamBId
                                  ) {
                                    selectWinner(
                                      match.id,
                                      match.teamBId,
                                    )
                                  }
                                }}
                              >
                                <div>
                                  <strong>
                                    {getTeamName(
                                      match.teamBId,
                                    )}
                                  </strong>

                                  {renderTeamPlayers(
                                    match.teamBId,
                                  )}
                                </div>

                                {match.winnerTeamId ===
                                  match.teamBId &&
                                  match.teamBId && (
                                    <span className="beer-match__winner-icon">
                                      ✓
                                    </span>
                                  )}
                              </button>
                            </article>
                          ),
                        )}
                      </div>
                    </div>
                  )
                },
              )}
            </div>
          </section>
        </>
      )}

      {championTeam &&
        state.championTeamId && (
          <section className="beer-champion">
            <p className="beer-eyebrow">
              Champions 2026
            </p>

            <div className="beer-champion__trophy">
              🏆
            </div>

            <h2>
              {getTeamName(
                state.championTeamId,
              )}
            </h2>

            <p>
              {getPlayerName(
                championTeam
                  .playerIds[0],
              )}

              <span>&</span>

              {getPlayerName(
                championTeam
                  .playerIds[1],
              )}
            </p>

            {canManage && (
              <button
                type="button"
                className="beer-secondary-button"
                onClick={
                  resetTournament
                }
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