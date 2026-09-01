import { supabase } from '../../lib/supabase'
import { summarizeHallPhotos, type HallPhoto, type HallPhotoSummary } from './highlights'

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
  photos: HallPhotoSummary | null
  photoError?: string
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
  photos: null,
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

async function fetchHallPhotos(): Promise<HallPhotoSummary> {
  const rows: HallPhoto[] = []
  const pageSize = 500
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from('photo_hunt_submissions')
      .select('id, player_key, player_name, storage_path, caption, status')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if ((data?.length ?? 0) < pageSize) break
  }
  return summarizeHallPhotos(rows)
}

export async function fetchHallOfFame(includePhotos = true): Promise<HallOfFameData> {
  const [{ data, error }, photoResult] = await Promise.all([
    supabase.rpc('get_party_hall_of_fame'),
    includePhotos
      ? fetchHallPhotos().then((photos) => ({ photos, photoError: '' }))
        .catch(() => ({ photos: null, photoError: 'Les souvenirs Photo Hunt n’ont pas pu être synchronisés.' }))
      : Promise.resolve({ photos: null, photoError: '' }),
  ])

  if (error) {
    throw error
  }

  return { ...(data ?? emptyHallOfFame), ...photoResult } as HallOfFameData
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
