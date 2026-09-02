import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeMusicText, rankTrackChoices } from '../supabase/functions/spotify-jukebox/catalog.ts'
const track = (id, title, artist, extra = {}) => ({ id: id.repeat(22), name: title, artists: [{ name: artist }], ...extra })

test('normalization handles accents, punctuation and non-Latin titles', () => {
  assert.equal(normalizeMusicText('  Pilé — Gospel! '), 'pile gospel')
  assert.equal(normalizeMusicText('夜に駆ける'), '夜に駆ける')
})
test('a unique exact title is enough when artist is omitted', () => {
  const found = rankTrackChoices([track('a', 'Blinding Lights', 'The Weeknd')], 'blinding lights', '')
  assert.equal(found.automatic.id, 'a'.repeat(22))
})
test('artist distinguishes songs sharing the same title', () => {
  const items = [track('a', 'Unstoppable', 'Sia'), track('b', 'Unstoppable', 'The Score')]
  assert.equal(rankTrackChoices(items, 'Unstoppable', '').automatic, null)
  assert.equal(rankTrackChoices(items, 'Unstoppable', 'The Score').automatic.id, 'b'.repeat(22))
})
test('duplicate album entries collapse but live and remix alternatives remain distinct', () => {
  const found = rankTrackChoices([track('a', 'Song', 'Artist'), track('b', 'Song', 'Artist'), track('c', 'Song - Live', 'Artist'), track('d', 'Song - Remix', 'Artist')], 'Song', 'Artist')
  assert.equal(found.choices.length, 3)
  assert.equal(found.automatic.id, 'a'.repeat(22))
})
test('typos, reversed fields and covers require explicit selection', () => {
  assert.equal(rankTrackChoices([track('a', 'Mauvais djo', 'Pilé, Gospel')], 'Pilé - Gospel', 'Mauvais djo').automatic, null)
  assert.equal(rankTrackChoices([track('a', 'Song', 'Cover Artist')], 'Song', 'Original Artist').automatic, null)
  assert.equal(rankTrackChoices([track('a', 'Song', 'Artist')], 'Snog', '').automatic, null)
})
test('unavailable and invalid tracks are excluded; responses expose only display fields', () => {
  const found = rankTrackChoices([track('a', 'Song', 'Artist', { is_playable: false }), track('b', 'Song', 'Artist', { is_local: true }), { id: 'invalid', name: 'Song' }, track('c', 'Song', 'Artist', { secret: 'PRIVATE' })], 'Song', '')
  assert.equal(found.choices.length, 1)
  assert.ok(!JSON.stringify(found).includes('PRIVATE'))
})
