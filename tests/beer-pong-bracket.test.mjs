import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'vite'

const bundle = await build({
  configFile: false,
  logLevel: 'error',
  build: { ssr: resolve('src/features/beer-pong/tournament.ts'), write: false, minify: false },
})
const cache = await mkdtemp(resolve('node_modules/.cache/beer-pong-bracket-'))
await mkdir(cache, { recursive: true })
const output = bundle.output.find((item) => item.isEntry)
await writeFile(join(cache, output.fileName), output.code)
const tournament = await import(pathToFileURL(join(cache, output.fileName)).href)
after(() => rm(cache, { recursive: true, force: true }))

const teams = (count) => Array.from({ length: count }, (_, index) => ({
  id: `team-${index + 1}`,
  playerIds: [`player-${index * 2 + 1}`, `player-${index * 2 + 2}`],
}))

test('21 teams create the complete 32-slot tree immediately', () => {
  let id = 0
  const rounds = tournament.createTournamentBracket(teams(21), {
    id: () => `match-${++id}`,
    random: () => 0.5,
  })

  assert.deepEqual(rounds.map((round) => round.length), [16, 8, 4, 2, 1])
  assert.equal(rounds[0].filter((match) => !match.teamAId || !match.teamBId).length, 11)
  assert.equal(rounds.flat().length, 31)
  assert.equal(tournament.getChampionTeamId(rounds), null)
})

test('winners propagate through stable connected slots until one champion remains', () => {
  let id = 0
  let rounds = tournament.createTournamentBracket(teams(21), {
    id: () => `match-${++id}`,
    random: () => 0.5,
  })
  let played = 0

  while (!tournament.getChampionTeamId(rounds)) {
    const activeRound = rounds[tournament.getActiveRoundIndex(rounds)]
    const match = activeRound.find((candidate) => candidate.teamAId && candidate.teamBId && !candidate.winnerTeamId)
    assert.ok(match, 'a playable match must remain until the final')
    rounds = tournament.updateTournamentWinner(rounds, match.id, match.teamAId)
    played += 1
  }

  assert.equal(played, 20)
  assert.ok(tournament.getChampionTeamId(rounds))
})

test('correcting an upstream winner clears only results on the affected path', () => {
  let id = 0
  let rounds = tournament.createTournamentBracket(teams(8), {
    id: () => `match-${++id}`,
    random: () => 0.5,
  })
  for (const match of rounds[0]) rounds = tournament.updateTournamentWinner(rounds, match.id, match.teamAId)
  for (const match of rounds[1]) rounds = tournament.updateTournamentWinner(rounds, match.id, match.teamAId)
  rounds = tournament.updateTournamentWinner(rounds, rounds[2][0].id, rounds[2][0].teamAId)

  const unaffectedSemiWinner = rounds[1][1].winnerTeamId
  const correctedFirstMatch = rounds[0][0]
  rounds = tournament.updateTournamentWinner(rounds, correctedFirstMatch.id, correctedFirstMatch.teamBId)

  assert.equal(rounds[1][1].winnerTeamId, unaffectedSemiWinner)
  assert.equal(rounds[1][0].winnerTeamId, null)
  assert.equal(rounds[2][0].winnerTeamId, null)
})

test('a legacy first round is expanded without changing its results', () => {
  let id = 0
  const complete = tournament.createTournamentBracket(teams(8), {
    id: () => `match-${++id}`,
    random: () => 0.5,
  })
  const firstWinner = complete[0][0].teamAId
  const legacy = [[{ ...complete[0][0], winnerTeamId: firstWinner }, ...complete[0].slice(1)]]
  const upgraded = tournament.completeTournamentBracket(legacy)

  assert.deepEqual(upgraded.map((round) => round.length), [4, 2, 1])
  assert.equal(upgraded[0][0].winnerTeamId, firstWinner)
  assert.equal(upgraded[1][0].teamAId, firstWinner)
  assert.equal(upgraded[1][0].winnerTeamId, null)
  assert.equal(upgraded[2][0].teamAId, null)
})

test('duplicate legacy match IDs are repaired before winners propagate', () => {
  let id = 0
  const complete = tournament.createTournamentBracket(teams(8), {
    id: () => `match-${++id}`,
    random: () => 0.5,
  })
  const firstRound = complete[0].map((match) => ({
    ...match,
    winnerTeamId: match.teamAId,
  }))
  const legacySecondRound = complete[1].map((match, index) => ({
    ...match,
    id: 'duplicated-legacy-id',
    teamAId: firstRound[index * 2].winnerTeamId,
    teamBId: firstRound[index * 2 + 1].winnerTeamId,
    winnerTeamId: null,
  }))
  const repaired = tournament.completeTournamentBracket([
    firstRound,
    legacySecondRound,
  ])

  assert.equal(new Set(repaired.flat().map((match) => match.id)).size, 7)
  const firstSemi = repaired[1][0]
  const secondSemi = repaired[1][1]
  const updated = tournament.updateTournamentWinner(
    repaired,
    secondSemi.id,
    secondSemi.teamAId,
  )

  assert.equal(updated[1][0].winnerTeamId, firstSemi.winnerTeamId)
  assert.equal(updated[1][1].winnerTeamId, secondSemi.teamAId)
  assert.equal(updated[2][0].teamAId, null)
  assert.equal(updated[2][0].teamBId, secondSemi.teamAId)
})

test('a winner is selected by its exact bracket position even with duplicate IDs', () => {
  const duplicatedRounds = [[
    {
      id: 'legacy-match',
      teamAId: 'team-1',
      teamBId: 'team-2',
      winnerTeamId: null,
    },
    {
      id: 'legacy-match',
      teamAId: 'team-3',
      teamBId: 'team-4',
      winnerTeamId: null,
    },
  ]]

  const updated = tournament.updateTournamentWinnerAt(
    duplicatedRounds,
    0,
    1,
    'team-4',
  )

  assert.equal(updated[0][0].winnerTeamId, null)
  assert.equal(updated[0][1].winnerTeamId, 'team-4')
})

test('round connections are rebuilt by position when legacy source IDs are corrupt', () => {
  let id = 0
  let rounds = tournament.createTournamentBracket(teams(8), {
    id: () => `match-${++id}`,
    random: () => 0.5,
  })

  for (const match of rounds[0]) {
    rounds = tournament.updateTournamentWinner(
      rounds,
      match.id,
      match.teamAId,
    )
  }

  const corrupted = rounds.map((round, roundIndex) => round.map((match) => (
    roundIndex === 0
      ? match
      : {
          ...match,
          teamASourceMatchId: 'ancien-identifiant-duplique',
          teamBSourceMatchId: 'ancien-identifiant-duplique',
        }
  )))

  const secondMatchWinner = corrupted[1][1].teamBId
  const updated = tournament.updateTournamentWinnerAt(
    corrupted,
    1,
    1,
    secondMatchWinner,
  )

  assert.equal(updated[1][1].winnerTeamId, secondMatchWinner)
  assert.equal(updated[2][0].teamBId, secondMatchWinner)
  assert.equal(updated[2][0].teamBSourceMatchId, updated[1][1].id)
})
