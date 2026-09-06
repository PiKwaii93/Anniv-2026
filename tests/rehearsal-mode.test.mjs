import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const migrationPath = 'supabase/migrations/20260904232523_isolated_rehearsal_mode.sql'

test('rehearsal switching is admin-only, explicit and preparation-only', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  assert.match(sql, /public\.app_admins/)
  assert.match(sql, /CONFIRMATION_REQUIRED/)
  assert.match(sql, /PREPARATION_REQUIRED/)
  assert.match(sql, /PHOTO_CLEANUP_PENDING/)
  assert.match(sql, /SPOTIFY_BUSY/)
  assert.match(sql, /revoke all on function public\.admin_switch_party_environment\(text, text\) from public, anon/)
})

test('a switch snapshots before restoring and invalidates guest sessions', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  const disconnect = sql.indexOf('party_identity.disconnect_all(true)')
  const capture = sql.indexOf('source_payload := party_rehearsal.capture_active()')
  const restore = sql.indexOf('party_rehearsal.restore_slot(target_payload, target_environment)')
  assert.ok(disconnect > 0 && disconnect < capture)
  assert.ok(capture < restore)
  assert.match(sql, /data_epoch = data_epoch \+ 1/)
})

test('all mutable party modules are isolated in the slot payload', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  for (const key of [
    'beer_pong', 'room_players', 'room_rounds', 'room_votes',
    'mission_players', 'mission_history', 'mission_scoreboard', 'mission_validations',
    'photo_submissions', 'photo_slots', 'letters', 'songs', 'song_votes',
    'spotify_dispatches', 'spotify_limits', 'duo_queue', 'duo_matches',
    'chat_messages', 'chat_reads', 'bring_items',
  ]) assert.match(sql, new RegExp(`'${key}'`), `missing ${key}`)
})

test('inactive photo files survive an active-slot data reset', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  assert.match(sql, /select p_request,storage_path from public\.photo_hunt_submissions/)
  assert.match(sql, /union select p_request,storage_path from public\.photo_hunt_upload_slots/)
  assert.doesNotMatch(sql, /from storage\.objects/i)
})

test('the UI exposes the server switch and a persistent rehearsal warning', async () => {
  const [control, banner, context] = await Promise.all([
    readFile('src/features/party/AdminPartyEnvironment.tsx', 'utf8'),
    readFile('src/features/party/PartyEnvironmentBanner.tsx', 'utf8'),
    readFile('src/features/party/PartyContext.tsx', 'utf8'),
  ])
  assert.match(control, /admin_switch_party_environment/)
  assert.match(control, /settings\.phase === 'preparation'/)
  assert.match(control, /p_confirmation: target === 'rehearsal' \? 'REPETITION' : 'SOIREE'/)
  assert.match(banner, /Mode répétition/)
  assert.match(context, /environment: PartyEnvironment/)
})
