import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeHallPhotos, hallLeaders, hallRank, positiveRanking } from '../src/features/hallOfFame/highlights.ts'
const photo = (id, player = 'a', status = 'approved', name = player) => ({ id, player_key: player, player_name: name, status, storage_path: `${id}.jpg`, caption: null })

test('private and duplicate submissions never count or enter memories', () => {
  const result = summarizeHallPhotos([photo('1'), photo('1'), photo('2', 'b', 'pending'), photo('3', 'c', 'rejected')])
  assert.equal(result.published, 1)
  assert.equal(result.photographers, 1)
  assert.deepEqual(result.memories.map((p) => p.id), ['1'])
})
test('identity keys keep people with the same name separate', () => {
  const result = summarizeHallPhotos([photo('1', 'a', 'approved', 'Alex'), photo('2', 'b', 'approved', 'Alex'), photo('3', 'a', 'approved', 'Alex')])
  assert.equal(result.photographers, 2)
  assert.deepEqual(result.ranking.map((r) => r.score), [2, 1])
})
test('ties share competition rank and zero scores do not win', () => {
  const rows = [{ name: 'C', score: 2 }, { name: 'B', score: 4 }, { name: 'A', score: 4 }, { name: 'Z', score: 0 }]
  assert.deepEqual(hallLeaders(rows).map((r) => r.name), ['A', 'B'])
  assert.deepEqual(positiveRanking(rows).map((r) => hallRank(rows, r.score)), [1, 1, 3])
  assert.deepEqual(hallLeaders([{ name: 'Z', score: 0 }]), [])
  assert.equal(rows[0].name, 'C')
})
test('souvenirs alternate photographers and cap at twelve, totals remain complete', () => {
  const rows = [...Array.from({ length: 510 }, (_, i) => photo(`a-${i}`)), photo('b-1', 'b'), photo('c-1', 'c')]
  const result = summarizeHallPhotos(rows)
  assert.equal(result.published, 512)
  assert.equal(result.ranking[0].score, 510)
  assert.equal(result.memories.length, 12)
  assert.deepEqual(result.memories.slice(0, 3).map((p) => p.player_key), ['a', 'b', 'c'])
  assert.equal(new Set(result.memories.map((p) => p.id)).size, 12)
})
test('empty data yields no invented winner or memory', () => {
  assert.deepEqual(summarizeHallPhotos([]), { published: 0, photographers: 0, ranking: [], memories: [] })
})
