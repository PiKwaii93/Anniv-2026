import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const migrationPath = 'supabase/migrations/20260904232523_isolated_rehearsal_mode.sql'
const boundaryMigrationPath = 'supabase/migrations/20260907191421_harden_rehearsal_boundaries.sql'
const guestCatalogKeys = ['guests', 'plus_ones', 'guest_private_notes']

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

test('real guests survive a live to rehearsal to live round trip', async () => {
  const [switchSql, boundarySql] = await Promise.all([
    readFile(migrationPath, 'utf8'),
    readFile(boundaryMigrationPath, 'utf8'),
  ])

  for (const key of guestCatalogKeys) {
    assert.match(boundarySql, new RegExp(`'${key}', coalesce\\(\\(select jsonb_agg\\(to_jsonb\\(t\\)\\) from public\\.${key} t\\)`))
    assert.match(boundarySql, new RegExp(`coalesce\\(payload -> '${key}', '.*?'::jsonb\\)`))
  }

  const deletes = guestCatalogKeys.map(key => boundarySql.indexOf(`delete from public.${key}`))
  assert.ok(deletes.every(index => index > 0))
  assert.ok(deletes[2] < deletes[1] && deletes[1] < deletes[0], 'children must be deleted before guests')

  const inserts = guestCatalogKeys.map(key => boundarySql.indexOf(`insert into public.${key}`))
  assert.ok(inserts.every(index => index > 0))
  assert.ok(inserts[0] < inserts[1] && inserts[1] < inserts[2], 'guests must be restored before children')
  assert.ok(switchSql.indexOf('source_payload := party_rehearsal.capture_active()') < switchSql.indexOf('party_rehearsal.restore_slot(target_payload, target_environment)'))

  const realCatalog = {
    guests: [{ id: 'real-guest', name: 'Invité réel' }],
    plus_ones: [{ id: 'real-plus-one', guest_id: 'real-guest' }],
    guest_private_notes: [{ guest_id: 'real-guest', note: 'Note privée réelle' }],
  }
  const slots = {
    live: structuredClone(realCatalog),
    rehearsal: Object.fromEntries(guestCatalogKeys.map(key => [key, []])),
  }
  let environment = 'live'
  let active = structuredClone(realCatalog)
  const switchTo = target => {
    slots[environment] = structuredClone(active)
    active = structuredClone(slots[target])
    environment = target
  }

  switchTo('rehearsal')
  active.guests.push({ id: 'rehearsal-guest', name: 'Invité répétition' })
  switchTo('live')

  assert.deepEqual(active, realCatalog)
  assert.deepEqual(slots.rehearsal.guests, [{ id: 'rehearsal-guest', name: 'Invité répétition' }])
  assert.ok(!JSON.stringify(active).includes('rehearsal-guest'))
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
