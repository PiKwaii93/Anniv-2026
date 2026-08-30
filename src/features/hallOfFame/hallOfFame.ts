import { supabase } from '../../lib/supabase'

export type HallRankingRow = {
  name: string
  score: number
}

export type HallPlayerSnapshot = {
  id: string
  name: string
}

export type HallTeam = {
  id: string
  playerIds: [string, string]
}

export type HallMatch = {
  id: string
  teamAId: string | null
  teamBId: string | null
  winnerTeamId: string | null
}

export type HallBeerPongState = {
  playerSnapshots?: HallPlayerSnapshot[]
  teams?: HallTeam[]
  rounds?: HallMatch[][]
  championTeamId?: string | null
  draftValidated?: boolean
}

export type HallPopularRound = {
  prompt: string
  mode: 'likely' | 'majority' | 'predict' | 'who_said'
  votes: number
}

export type HallOfFameData = {
  participants: number
  beerPong: HallBeerPongState
  missions: {
    agents: number
    completed: number
    ranking: HallRankingRow[]
  }
  room: {
    players: number
    points: number
    rounds: number
    votes: number
    ranking: HallRankingRow[]
    popularRound: HallPopularRound | null
  }
}

export type HallBeerPongSummary = {
  championName: string | null
  championPlayers: string[]
  teamCount: number
  matchesPlayed: number
}

export const emptyHallOfFame: HallOfFameData = {
  participants: 0,
  beerPong: {},
  missions: {
    agents: 0,
    completed: 0,
    ranking: [],
  },
  room: {
    players: 0,
    points: 0,
    rounds: 0,
    votes: 0,
    ranking: [],
    popularRound: null,
  },
}

export async function fetchHallOfFame(): Promise<HallOfFameData> {
  const { data, error } = await supabase.rpc('get_party_hall_of_fame')

  if (error) {
    throw error
  }

  return (data ?? emptyHallOfFame) as HallOfFameData
}

export function getBeerPongHallSummary(
  state: HallBeerPongState,
): HallBeerPongSummary {
  const players = new Map(
    (state.playerSnapshots ?? []).map((player) => [player.id, player.name]),
  )
  const teams = new Map(
    (state.teams ?? []).map((team) => [team.id, team]),
  )

  const championTeam = state.championTeamId
    ? teams.get(state.championTeamId)
    : undefined

  const championPlayers = championTeam
    ? championTeam.playerIds.map((playerId) => players.get(playerId) ?? 'Joueur')
    : []

  const matchesPlayed = (state.rounds ?? []).reduce(
    (total, round) => total + round.filter(
      (match) =>
        Boolean(match.teamAId) &&
        Boolean(match.teamBId) &&
        Boolean(match.winnerTeamId),
    ).length,
    0,
  )

  return {
    championName:
      championPlayers.length === 2
        ? championPlayers.join(' & ')
        : null,
    championPlayers,
    teamCount: state.teams?.length ?? 0,
    matchesPlayed,
  }
}
