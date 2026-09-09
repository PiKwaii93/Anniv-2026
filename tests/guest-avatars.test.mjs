import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const migrationPath = 'supabase/migrations/20260909171320_add_guest_profile_photos.sql'

test('guest avatars use a constrained public bucket with admin-only writes', async () => {
  const sql = await readFile(migrationPath, 'utf8')

  assert.match(sql, /alter table public\.guests[\s\S]*add column if not exists avatar_path text/)
  assert.match(sql, /alter table public\.plus_ones[\s\S]*add column if not exists avatar_path text/)
  assert.match(sql, /'guest-avatars'[\s\S]*true[\s\S]*2097152/)
  assert.match(sql, /array\['image\/jpeg', 'image\/png', 'image\/webp'\]/)
  assert.match(sql, /for insert[\s\S]*to authenticated[\s\S]*public\.app_admins/)
  assert.match(sql, /for delete[\s\S]*to authenticated[\s\S]*public\.app_admins/)
  assert.doesNotMatch(sql, /for (insert|update|delete)[\s\S]{0,80}to anon/)
})

test('avatar replacement validates files and never overwrites an existing object', async () => {
  const context = await readFile('src/features/guests/GuestsContext.tsx', 'utf8')

  assert.match(context, /\['image\/jpeg', 'image\/png', 'image\/webp'\]/)
  assert.match(context, /file\.size > 2 \* 1024 \* 1024/)
  assert.match(context, /crypto\.randomUUID\(\)/)
  assert.match(context, /upsert: false/)
  assert.match(context, /\.update\(\{ avatar_path: nextPath \}\)/)
  assert.match(context, /remove\(\[previousPath\]\)/)
})

test('profile photos appear where guests identify people and choose witnesses', async () => {
  const sources = await Promise.all([
    readFile('src/features/identity/HomeIdentityOnboarding.tsx', 'utf8'),
    readFile('src/features/identity/PartyIdentityUI.tsx', 'utf8'),
    readFile('src/pages/Guests.tsx', 'utf8'),
    readFile('src/pages/SecretMissions.tsx', 'utf8'),
    readFile('src/features/missions/MissionValidation.tsx', 'utf8'),
  ])

  for (const source of sources) {
    assert.match(source, /<GuestAvatar/)
  }
})

test('avatar initials remain visible and uploads are cropped before storage', async () => {
  const [avatar, avatarStyles, cropper, admin] = await Promise.all([
    readFile('src/features/guests/GuestAvatar.tsx', 'utf8'),
    readFile('src/features/guests/GuestAvatar.css', 'utf8'),
    readFile('src/features/guests/AvatarCropDialog.tsx', 'utf8'),
    readFile('src/pages/Admin.tsx', 'utf8'),
  ])

  assert.match(avatar, /guest-profile-avatar__initial/)
  assert.match(avatarStyles, /\.guest-profile-avatar\.guest-profile-avatar/)
  assert.match(avatarStyles, /border-radius: 50%/)
  assert.match(cropper, /type="range"/)
  assert.match(cropper, /onPointerMove/)
  assert.match(cropper, /context\.drawImage/)
  assert.match(cropper, /canvas\.toBlob\(resolve, 'image\/webp'/)
  assert.match(admin, /setCropFile\(file\)/)
  assert.match(admin, /onChange\(croppedFile\)/)
})

test('Beer Pong keeps and displays guest photos throughout the tournament', async () => {
  const [beerPong, partyScreen] = await Promise.all([
    readFile('src/pages/BeerPong.tsx', 'utf8'),
    readFile('src/pages/PartyScreenAuto.tsx', 'utf8'),
  ])

  assert.match(beerPong, /avatarPath: guest\.avatarPath/)
  assert.match(beerPong, /avatarPath: plusOne\.avatarPath/)
  assert.match(beerPong, /<GuestAvatar/)
  assert.match(beerPong, /beer-team__members/)
  assert.match(beerPong, /beer-match__faces/)
  assert.match(partyScreen, /party-screen-auto__player-faces/)
  assert.match(partyScreen, /path=\{player\.avatarPath\}/)
})
