import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationPath = 'supabase/migrations/20260912013000_add_screen_director_events.sql'

test('screen events are durable, unique, expirable, and claimed atomically', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  assert.match(sql, /unique \(environment, aggregate_key\)/i)
  assert.match(sql, /expires_at > clock_timestamp\(\)/i)
  assert.match(sql, /for update skip locked/i)
  assert.match(sql, /claimed_at = clock_timestamp\(\)/i)
  assert.match(sql, /screen_events_are_visible/i)
  assert.match(sql, /new\.data_epoch is distinct from old\.data_epoch/i)
})

test('Beer Pong only emits on a real unresolved-to-winner transition', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  assert.match(sql, /v_old_match ->> 'winnerTeamId' is not null/i)
  assert.match(sql, /v_match ->> 'teamAId' is null/i)
  assert.match(sql, /v_match ->> 'teamBId' is null/i)
  assert.match(sql, /beer-pong:match:/i)
})

test('Bingo completion is idempotent for one grid', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  assert.match(sql, /bingo:grid:' \|\| p_grid_id::text/i)
  assert.match(sql, /on conflict \(environment, aggregate_key\) do nothing/i)
  assert.match(sql, /party_extras\.identity_name\(p_player_key, p_session_token\)/i)

  const source = await readFile('src/pages/Bingo.tsx', 'utf8')
  assert.match(source, /!wasFullHouse && becomesFullHouse/)
  assert.match(source, /fullHouseAnnouncement: 'pending'/)
  assert.match(source, /complete_bingo_grid/)
})

test('automatic TV keeps Photos mounted and uses conditional ambient inserts', async () => {
  const source = await readFile('src/pages/PartyScreenAuto.tsx', 'utf8')
  assert.match(source, /PHOTO_MINIMUM_DWELL_MS = 90_000/)
  assert.match(source, /<PhotoHuntScreen paused=\{paused \|\| Boolean\(insert\)\}/)
  assert.doesNotMatch(source, /AUTO_SLIDE_DURATION|setSlideIndex/)
  assert.match(source, /ICEBERG_COOLDOWN_MS/)
})
