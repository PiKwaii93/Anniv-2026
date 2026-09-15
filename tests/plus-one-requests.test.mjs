import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationPath =
  'supabase/migrations/20260911110000_add_plus_one_requests_and_auto_approve_photos.sql'
const photoDimensionsMigrationPath =
  'supabase/migrations/20260911234500_store_photo_hunt_dimensions.sql'

test('plus-one requests stay private and every action verifies an identity or an admin', async () => {
  const sql = await readFile(migrationPath, 'utf8')

  assert.match(sql, /create schema if not exists party_plus_one_requests/i)
  assert.match(sql, /alter table party_plus_one_requests\.requests enable row level security/i)
  assert.match(sql, /revoke all on all tables in schema party_plus_one_requests from public, anon, authenticated/i)
  assert.match(sql, /party_extras\.identity_name\(p_player_key, p_session_token\)/i)
  assert.match(sql, /from public\.app_admins a[\s\S]*a\.user_id = \(select auth\.uid\(\)\)/i)
  assert.match(sql, /where status = 'pending'/i)
})

test('approving a request creates the official plus-one atomically', async () => {
  const sql = await readFile(migrationPath, 'utf8')

  assert.match(sql, /select \*[\s\S]*for update;/i)
  assert.match(sql, /insert into public\.plus_ones \(guest_id, name\)/i)
  assert.match(sql, /set status = 'approved',[\s\S]*plus_one_id = v_plus_one_id/i)
  assert.match(sql, /create unique index plus_one_requests_one_pending_per_guest_idx/i)
})

test('Photo Hunt inserts are published without an admin approval step', async () => {
  const sql = await readFile(migrationPath, 'utf8')

  assert.match(sql, /alter column status set default 'approved'/i)
  assert.match(sql, /new\.status := 'approved'/i)
  assert.match(sql, /before insert on public\.photo_hunt_submissions/i)
  assert.match(sql, /'status', 'approved'/i)
  assert.match(sql, /where status = 'pending'/i)
})

test('Photo Hunt stores validated image dimensions before composing the TV wall', async () => {
  const sql = await readFile(photoDimensionsMigrationPath, 'utf8')

  assert.match(sql, /add column if not exists image_width integer/i)
  assert.match(sql, /add column if not exists image_height integer/i)
  assert.match(sql, /p_image_width not between 1 and 10000/i)
  assert.match(sql, /p_image_height not between 1 and 10000/i)
  assert.match(sql, /image_width,[\s\S]*image_height,[\s\S]*caption/i)
  assert.match(sql, /p_image_width,[\s\S]*p_image_height,[\s\S]*nullif\(btrim\(p_caption\), ''\)/i)
  assert.match(sql, /set search_path = ''/i)
  assert.match(sql, /revoke all on function public\.finalize_photo_hunt_upload[\s\S]*from public/i)
})
