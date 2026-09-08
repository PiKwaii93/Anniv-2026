import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationPath = 'supabase/migrations/20260908075929_revoke_deleted_guest_sessions.sql'

test('guest deletion revokes every credential while preserving game rows', async () => {
  const sql = await readFile(migrationPath, 'utf8')

  assert.match(sql, /before delete on public\.guests/i)
  assert.match(sql, /before delete on public\.plus_ones/i)
  assert.match(sql, /insert into party_identity\.revoked_tokens/i)
  assert.match(sql, /update public\.live_vote_players/i)
  assert.match(sql, /update public\.secret_mission_players/i)
  assert.match(sql, /delete from public\.party_identity_sessions/i)
  assert.doesNotMatch(sql, /delete from public\.(live_vote_players|secret_mission_players)/i)
})

test('private trigger helpers cannot be called through the Data API roles', async () => {
  const sql = await readFile(migrationPath, 'utf8')

  assert.match(sql, /security definer\s+set search_path = ''/gi)
  assert.match(sql, /revoke all on function party_identity\.revoke_player_keys\(text\[\]\)\s+from public, anon, authenticated/i)
  assert.match(sql, /revoke all on function party_identity\.revoke_deleted_guest_sessions\(\)\s+from public, anon, authenticated/i)
  assert.match(sql, /revoke all on function party_identity\.revoke_deleted_plus_one_sessions\(\)\s+from public, anon, authenticated/i)
})
