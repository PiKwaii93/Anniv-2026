import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationPath = 'supabase/migrations/20260911213000_add_party_captains.sql'

test('captain invitations are private, temporary and limited to confirmed guests', async () => {
  const sql = await readFile(migrationPath, 'utf8')

  assert.match(sql, /role in \('owner', 'captain'\)/)
  assert.match(sql, /g\.status = 'confirmed'/)
  assert.match(sql, /interval '14 days'/)
  assert.match(sql, /occupied_count >= 4/)
  assert.match(sql, /encode\(sha256\(convert_to\(p_token::text, 'UTF8'\)\), 'hex'\)/)
  assert.match(sql, /revoke all on table public\.party_captain_invites from public, anon, authenticated/)
  assert.doesNotMatch(sql, /grant (select|insert|update|delete|all)[^;]*party_captain_invites[^;]*authenticated/i)
})

test('only the owner can manage roles and destructive party operations', async () => {
  const sql = await readFile(migrationPath, 'utf8')

  for (const operation of [
    'admin_list_party_captains',
    'admin_create_party_captain_invite',
    'admin_revoke_party_captain',
    'admin_switch_party_environment',
    'party_reset.status',
    'party_reset.reset',
    'party_reset.ack_photos',
  ]) {
    assert.match(sql, new RegExp(`${operation.replace('.', '\\\.')}[\\s\\S]*?OWNER_REQUIRED`))
  }

  assert.match(sql, /create policy "Owner can delete guests"[\s\S]*?using \(public\.is_party_owner\(\)\)/)
  assert.match(sql, /revoke all on function party_reset\.reset_admin_legacy\(uuid, text\) from public, anon, authenticated/)
})

test('captain activation requires an authenticated permanent account', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  const join = await readFile('src/pages/CaptainJoin.tsx', 'utf8')
  const auth = await readFile('src/features/auth/AuthContext.tsx', 'utf8')

  assert.match(sql, /accept_party_captain_invite/)
  assert.match(sql, /AUTH_REQUIRED/)
  assert.match(sql, /PERMANENT_ACCOUNT_REQUIRED/)
  assert.match(join, /emailRedirectTo: redirectUrl/)
  assert.match(join, /\/captain\?token=/)
  assert.match(auth, /select\('user_id, role'\)/)
  assert.match(auth, /data\?\.role === 'captain'/)
})

test('owner UI manages invitations while captain UI hides owner controls', async () => {
  const app = await readFile('src/App.tsx', 'utf8')
  const management = await readFile('src/pages/CaptainManagement.tsx', 'utf8')
  const dashboard = await readFile('src/pages/AdminDashboard.tsx', 'utf8')
  const guests = await readFile('src/pages/Admin.tsx', 'utf8')

  assert.match(app, /path="\/captain"/)
  assert.match(app, /path="\/admin\/captains"/)
  assert.match(management, /admin_create_party_captain_invite/)
  assert.match(management, /admin_revoke_party_captain/)
  assert.match(management, /\/4 places attribuées ou réservées/)
  assert.match(dashboard, /adminRole !== 'captain'/)
  assert.match(guests, /isOwner && <AdminGuestSessions/)
  assert.match(guests, /isOwner && <AdminPartyDataReset/)
})

test('captain onboarding explains the separate secure account and stays centered on desktop', async () => {
  const management = await readFile('src/pages/CaptainManagement.tsx', 'utf8')
  const managementCss = await readFile('src/pages/CaptainManagement.css', 'utf8')
  const join = await readFile('src/pages/CaptainJoin.tsx', 'utf8')
  const login = await readFile('src/pages/AdminLogin.tsx', 'utf8')

  assert.match(management, /Elle doit ouvrir exactement ce lien/)
  assert.match(management, /Régénérer le lien/)
  assert.match(managementCss, /width: min\(100%, 900px\);[\s\S]*?margin: 0 auto 42px/)
  assert.match(join, /Ton profil invité et ton accès admin sont séparés/)
  assert.match(login, /Première connexion capitaine/)
})
