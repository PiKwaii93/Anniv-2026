import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('practical information is routed for guests and administrators', async () => {
  const [app, home, navigation] = await Promise.all([
    readFile('src/App.tsx', 'utf8'),
    readFile('src/pages/Home.tsx', 'utf8'),
    readFile('src/features/guest/navigation.ts', 'utf8'),
  ])
  assert.match(app, /path="\/info"/)
  assert.match(app, /path="\/admin\/info"/)
  assert.match(home, /Infos pratiques/)
  assert.match(navigation, /'\/info'/)
})

test('rehearsal isolates guest catalogs and blocks real external controls', async () => {
  const sql = await readFile('supabase/migrations/20260907103000_harden_rehearsal_boundaries.sql', 'utf8')
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
