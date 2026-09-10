export type TournamentTeam = {
  id: string
  playerIds: [string, string]
}

export type TournamentMatch = {
  id: string
  teamAId: string | null
  teamBId: string | null
  winnerTeamId: string | null
  teamASourceMatchId?: string | null
  teamBSourceMatchId?: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function normalizeTournamentRounds(value: unknown) {
  if (!Array.isArray(value)) return []

  const rounds = value.map((round) => {
    if (!Array.isArray(round)) return []
    return round.flatMap((candidate): TournamentMatch[] => {
      if (!isRecord(candidate) || typeof candidate.id !== 'string') return []
      const teamAId = typeof candidate.teamAId === 'string' ? candidate.teamAId : null
      const teamBId = typeof candidate.teamBId === 'string' ? candidate.teamBId : null
      const teamASourceMatchId = typeof candidate.teamASourceMatchId === 'string' ? candidate.teamASourceMatchId : null
      const teamBSourceMatchId = typeof candidate.teamBSourceMatchId === 'string' ? candidate.teamBSourceMatchId : null
      if (!teamAId && !teamBId && !teamASourceMatchId && !teamBSourceMatchId) return []
      const winnerTeamId = typeof candidate.winnerTeamId === 'string'
        && (candidate.winnerTeamId === teamAId || candidate.winnerTeamId === teamBId)
        ? candidate.winnerTeamId
        : null
      return [{ id: candidate.id, teamAId, teamBId, winnerTeamId, teamASourceMatchId, teamBSourceMatchId }]
    })
  }).filter((round) => round.length > 0)

  return completeTournamentBracket(rounds)
}

export function getNextPowerOfTwo(value: number) {
  let power = 1
  while (power < value) power *= 2
  return power
}

function shuffle<T>(items: T[], random: () => number) {
  const shuffled = [...items]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(random() * (index + 1))
    const item = shuffled[index]
    shuffled[index] = shuffled[randomIndex]
    shuffled[randomIndex] = item
  }
  return shuffled
}

function resolveRounds(rounds: TournamentMatch[][]) {
  const resolved = rounds.map((round) => round.map((match) => ({ ...match })))

  for (let roundIndex = 0; roundIndex < resolved.length; roundIndex += 1) {
    const round = resolved[roundIndex]

    for (const match of round) {
      if (roundIndex > 0) {
        const previousRound = resolved[roundIndex - 1]
        const sourceA = previousRound.find((candidate) => candidate.id === match.teamASourceMatchId)
        const sourceB = previousRound.find((candidate) => candidate.id === match.teamBSourceMatchId)
        match.teamAId = sourceA?.winnerTeamId ?? null
        match.teamBId = sourceB?.winnerTeamId ?? null
      }

      const validWinner = Boolean(match.winnerTeamId)
        && (match.winnerTeamId === match.teamAId || match.winnerTeamId === match.teamBId)
      if (!validWinner) match.winnerTeamId = null

      if (roundIndex > 0 && (!match.teamAId || !match.teamBId)) {
        match.winnerTeamId = null
      }

      if (
        roundIndex === 0
        && !match.winnerTeamId
        && Boolean(match.teamAId) !== Boolean(match.teamBId)
      ) {
        match.winnerTeamId = match.teamAId ?? match.teamBId
      }
    }
  }

  return resolved
}

export function createTournamentBracket(
  teams: TournamentTeam[],
  options: { id?: () => string; random?: () => number } = {},
) {
  if (teams.length < 2) return []

  const createId = options.id ?? (() => crypto.randomUUID())
  const random = options.random ?? Math.random
  const shuffledTeams = shuffle(teams, random)
  const bracketSize = getNextPowerOfTwo(shuffledTeams.length)
  const firstRoundCount = bracketSize / 2
  const competitiveMatchCount = shuffledTeams.length - firstRoundCount
  const firstRound: TournamentMatch[] = []
  let teamIndex = 0

  for (let index = 0; index < competitiveMatchCount; index += 1) {
    firstRound.push({
      id: createId(),
      teamAId: shuffledTeams[teamIndex]?.id ?? null,
      teamBId: shuffledTeams[teamIndex + 1]?.id ?? null,
      winnerTeamId: null,
      teamASourceMatchId: null,
      teamBSourceMatchId: null,
    })
    teamIndex += 2
  }

  while (teamIndex < shuffledTeams.length) {
    const teamId = shuffledTeams[teamIndex].id
    firstRound.push({
      id: createId(),
      teamAId: teamId,
      teamBId: null,
      winnerTeamId: teamId,
      teamASourceMatchId: null,
      teamBSourceMatchId: null,
    })
    teamIndex += 1
  }

  const rounds: TournamentMatch[][] = [shuffle(firstRound, random)]
  while (rounds.at(-1)!.length > 1) {
    const previousRound = rounds.at(-1)!
    const nextRound: TournamentMatch[] = []
    for (let index = 0; index < previousRound.length; index += 2) {
      nextRound.push({
        id: createId(),
        teamAId: null,
        teamBId: null,
        winnerTeamId: null,
        teamASourceMatchId: previousRound[index].id,
        teamBSourceMatchId: previousRound[index + 1].id,
      })
    }
    rounds.push(nextRound)
  }

  return resolveRounds(rounds)
}

export function completeTournamentBracket(rounds: TournamentMatch[][]) {
  if (rounds.length === 0 || rounds[0].length === 0) return rounds

  const usedIds = new Set<string>()
  const uniqueId = (
    preferredId: string,
    roundIndex: number,
    matchIndex: number,
  ) => {
    if (!usedIds.has(preferredId)) {
      usedIds.add(preferredId)
      return preferredId
    }

    const base = `bracket-${roundIndex}-${matchIndex}`
    let candidate = base
    let suffix = 1
    while (usedIds.has(candidate)) {
      candidate = `${base}-${suffix}`
      suffix += 1
    }
    usedIds.add(candidate)
    return candidate
  }

  const completed: TournamentMatch[][] = [rounds[0].map((match, index) => ({
    ...match,
    id: uniqueId(match.id, 0, index),
    teamASourceMatchId: null,
    teamBSourceMatchId: null,
  }))]

  let roundIndex = 1
  while (completed[roundIndex - 1].length > 1) {
    const previousRound = completed[roundIndex - 1]
    const existingRound = rounds[roundIndex] ?? []
    const nextRound: TournamentMatch[] = []

    for (let index = 0; index < previousRound.length; index += 2) {
      const existing = existingRound[index]
      const sourceA = previousRound[index]
      const sourceB = previousRound[index + 1]
      nextRound.push({
        id: uniqueId(
          existing?.id ?? `bracket-${roundIndex}-${index / 2}`,
          roundIndex,
          index / 2,
        ),
        teamAId: existing?.teamAId ?? null,
        teamBId: existing?.teamBId ?? null,
        winnerTeamId: existing?.winnerTeamId ?? null,
        teamASourceMatchId: sourceA.id,
        teamBSourceMatchId: sourceB.id,
      })
    }

    completed.push(nextRound)
    roundIndex += 1
  }

  return resolveRounds(completed)
}

export function updateTournamentWinner(
  rounds: TournamentMatch[][],
  matchId: string,
  teamId: string,
) {
  const updated = rounds.map((round) => round.map((match) => (
    match.id === matchId && (match.teamAId === teamId || match.teamBId === teamId)
      ? { ...match, winnerTeamId: teamId }
      : { ...match }
  )))
  return resolveRounds(updated)
}

export function getActiveRoundIndex(rounds: TournamentMatch[][]) {
  const index = rounds.findIndex((round) => round.some(
    (match) => match.teamAId && match.teamBId && !match.winnerTeamId,
  ))
  return index === -1 ? Math.max(0, rounds.length - 1) : index
}

export function getChampionTeamId(rounds: TournamentMatch[][]) {
  const final = rounds.at(-1)?.[0]
  return final?.teamAId && final.teamBId ? final.winnerTeamId : null
}

export function getRoundName(matches: TournamentMatch[], index: number) {
  if (matches.length === 1) return 'Finale'
  if (matches.length === 2) return 'Demi-finales'
  if (matches.length === 4) return 'Quarts de finale'
  if (matches.length === 8) return 'Huitièmes de finale'
  return `Tour ${index + 1}`
}
