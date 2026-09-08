import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('practical information is routed for guests and administrators', async () => {
  const [app, home, navigation, admin] = await Promise.all([
    readFile('src/App.tsx', 'utf8'),
    readFile('src/pages/Home.tsx', 'utf8'),
    readFile('src/features/guest/navigation.ts', 'utf8'),
    readFile('src/pages/EventInfoAdmin.tsx', 'utf8'),
  ])
  assert.match(app, /path="\/info"/)
  assert.match(app, /path="\/admin\/info"/)
  assert.match(home, /Infos pratiques/)
  assert.match(navigation, /'\/info'/)
  assert.equal(admin.match(/disabled=\{rehearsal \|\| saving\}/g)?.length, 7)
})

test('unanimous likely nominations reveal their result without creating a final vote', async () => {
  const sql = await readFile('supabase/migrations/20260908160000_reveal_unanimous_likely_vote.sql', 'utf8')
  assert.match(sql, /if v_count = 0 then[\s\S]*'NO_NOMINATIONS'/)
  assert.match(sql, /if v_count = 1 then[\s\S]*set status = 'revealed'/)
  assert.match(sql, /'percentage', 100/)
  assert.match(sql, /perform public\.refresh_live_vote_public_state\(\)/)
})

test('rehearsal isolates guest catalogs and blocks real external controls', async () => {
  const sql = await readFile('supabase/migrations/20260907191421_harden_rehearsal_boundaries.sql', 'utf8')
  for (const key of ['guests', 'plus_ones', 'guest_private_notes']) {
    assert.match(sql, new RegExp(`'${key}'`))
  }
  assert.match(sql, /LIVE_ENVIRONMENT_REQUIRED/)
  assert.match(sql, /REHEARSAL_SPOTIFY_DISABLED/g)
})

test('Windows-safe TV status module names no longer collide by casing', async () => {
  const component = await readFile('src/features/party/TvStatus.tsx', 'utf8')
  assert.match(component, /\.\/tvStatusModel/)
})
