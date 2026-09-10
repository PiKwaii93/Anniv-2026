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
