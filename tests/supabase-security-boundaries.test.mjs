import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationPath = 'supabase/migrations/20260908082945_harden_supabase_security_boundaries.sql'

test('legacy trigger helpers have fixed search paths and no API grants', async () => {
  const sql = await readFile(migrationPath, 'utf8')

  assert.match(sql, /alter function public\.set_beer_pong_updated_at\(\) set search_path = ''/i)
  assert.match(sql, /alter function public\.set_iceberg_entry_updated_at\(\) set search_path = ''/i)
  assert.match(sql, /revoke all on function public\.set_beer_pong_updated_at\(\)\s+from public, anon, authenticated/i)
  assert.match(sql, /revoke all on function public\.set_iceberg_entry_updated_at\(\)\s+from public, anon, authenticated/i)
})

test('guest eligibility loss revokes sessions and internal photo identity is private', async () => {
  const sql = await readFile(migrationPath, 'utf8')

  assert.match(sql, /party_identity\.is_valid\(p_player_key, p_session_token\)/i)
  assert.match(sql, /revoke all on function public\.photo_hunt_identity_name\(text, uuid\)\s+from public, anon, authenticated/i)
  assert.match(sql, /before update of status on public\.guests/i)
  assert.match(sql, /old\.status = 'confirmed' and new\.status is distinct from 'confirmed'/i)
  assert.match(sql, /party_identity\.revoke_deleted_guest_sessions\(\)/i)
})
