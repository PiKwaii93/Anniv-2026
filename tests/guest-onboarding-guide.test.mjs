import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  completeGuestGuide,
  GUEST_GUIDE_STORAGE_KEY,
  GUEST_GUIDE_VERSION,
  hasCompletedGuestGuide,
} from '../src/features/onboarding/guestGuideState.ts'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('guest guide completion is local, optional and versioned', () => {
  const values = new Map()
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }

  assert.equal(hasCompletedGuestGuide(storage), false)
  completeGuestGuide(storage)
  assert.equal(values.get(GUEST_GUIDE_STORAGE_KEY), GUEST_GUIDE_VERSION)
  assert.equal(hasCompletedGuestGuide(storage), true)
})

test('the first-use guide presents the four guest tabs and can be replayed', () => {
  const guide = read('src/features/onboarding/GuestWelcomeGuide.tsx')
  const shell = read('src/features/guest/GuestShell.tsx')
  const identity = read('src/features/identity/PartyIdentityUI.tsx')

  for (const label of ['Bienvenue', 'Jouer', 'Photos', 'Musique']) {
    assert.match(guide, new RegExp(`eyebrow: '${label}'`))
  }
  for (const visual of ['home', 'games', 'photos', 'music']) {
    assert.match(guide, new RegExp(`visual: '${visual}'`))
  }

  assert.match(guide, /GuestGuideVisual/)
  assert.match(guide, /guest-guide-demo__shortcuts/)
  assert.match(guide, /guest-guide-demo__game-list/)
  assert.match(guide, /guest-guide-demo__challenge/)
  assert.match(guide, /guest-guide-demo__field/)
  assert.doesNotMatch(guide, /<img|\/onboarding\/.*\.svg/)
  assert.match(guide, /aria-modal="true"/)
  assert.match(guide, /onPointerDown=/)
  assert.match(guide, /onPointerUp=/)
  assert.match(guide, />\s*Passer\s*</)
  assert.match(guide, /C'est parti/)
  assert.match(shell, /<GuestWelcomeGuide enabled=\{!isAdmin && Boolean\(identity\)/)
  assert.match(identity, /Revoir le guide/)
})
