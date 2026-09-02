import test from 'node:test'
import assert from 'node:assert/strict'
import { safeMusicLink, songExport, letterExport, revealDate } from '../src/features/party-extras/model.ts'
import { buildCredits } from '../src/features/party-extras/credits.ts'

test('music links reject scripts, credentials, impersonation and non-music sites', () => {
  for (const link of ['javascript:alert(1)', 'http://youtu.be/1', 'https://open.spotify.com.evil.test/1', 'https://open.spotify.com@evil.test/1', 'https://a:b@open.spotify.com/1', 'https://open.spotify.com:8080/1', 'https://example.com/', 'https://youtu.be/a b']) assert.equal(safeMusicLink(link), null, link)
  assert.equal(safeMusicLink('https://youtu.be/track'), 'https://youtu.be/track')
  assert.equal(safeMusicLink('https://open.spotify.com'), 'https://open.spotify.com/')
  assert.equal(safeMusicLink('https://music.apple.com/fr/album/1'), 'https://music.apple.com/fr/album/1')
})
test('playlist export excludes pending/refused tracks and unsafe links', () => {
  const song = { title: 'Good', artist: 'Artist', player_name: 'Alex', votes: 3, status: 'queued', link: 'javascript:alert(1)' }
  const exported = songExport([song, { ...song, title: 'Secret', status: 'pending' }, { ...song, title: 'Nope', status: 'rejected' }])
  assert.ok(exported.includes('Artist — Good'))
  assert.ok(!exported.includes('Secret') && !exported.includes('Nope') && !exported.includes('javascript:'))
})
test('letter export preserves all three fields and reveal date uses Paris time', () => {
  const exported = letterExport([{ player_name: 'Alex', message: 'Bon anniv', memory: 'Le voyage', prediction: 'Un nouveau voyage' }])
  for (const value of ['Alex', 'Bon anniv', 'Le voyage', 'Un nouveau voyage']) assert.ok(exported.includes(value))
  assert.ok(revealDate('2026-10-25T11:00:00Z').includes('12:00'))
})
const hall = { photos: null, missions: { ranking: [] }, room: { ranking: [] } }
const visible = { guestsVisible: true, photosVisible: true, missionsVisible: true, roomVisible: true, beerPongVisible: true }
test('empty credits never invent winners or photos', () => {
  assert.deepEqual(buildCredits([], hall, visible, []).map((slide) => slide.id), ['intro', 'outro'])
})
test('all guest names survive pagination, including namesakes', () => {
  const names = [...Array.from({ length: 27 }, (_, i) => `Guest ${i}`), 'Alex', 'Alex']
  const pages = buildCredits(names, hall, visible, []).filter((slide) => slide.id.startsWith('guests-'))
  assert.deepEqual(pages.flatMap((slide) => slide.names), names)
  assert.ok(pages.every((slide) => slide.names.length <= 12))
})
test('credits honor visibility, exclude private photos, celebrate tied positive winners', () => {
  const data = { ...hall, photos: { memories: [{ id: 'public', status: 'approved' }, { id: 'private', status: 'pending' }], ranking: [{ name: 'Camera', score: 1 }] }, missions: { ranking: [{ name: 'A', score: 2 }, { name: 'B', score: 2 }, { name: 'C', score: 0 }] } }
  const slides = buildCredits(['Alex'], data, visible, ['Champion'])
  assert.deepEqual(slides.find((slide) => slide.id === 'missions-0').names, ['A', 'B'])
  assert.deepEqual(slides.flatMap((slide) => slide.photos ?? []).map((photo) => photo.id), ['public'])
  const hidden = Object.fromEntries(Object.keys(visible).map((key) => [key, false]))
  assert.deepEqual(buildCredits(['Alex'], data, hidden, ['Champion']).map((slide) => slide.id), ['intro', 'outro'])
})
