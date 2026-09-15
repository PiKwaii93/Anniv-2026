import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  completeGuestGuide,
  GUEST_GUIDE_STORAGE_KEYS,
  GUEST_GUIDE_VERSION,
  hasCompletedGuestGuide,
} from '../src/features/onboarding/guestGuideState.ts'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('preparation and live guide completion are local, independent and versioned', () => {
  const values = new Map()
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }

  assert.equal(hasCompletedGuestGuide('preparation', storage), false)
  assert.equal(hasCompletedGuestGuide('live', storage), false)

  completeGuestGuide('preparation', storage)
  assert.equal(values.get(GUEST_GUIDE_STORAGE_KEYS.preparation), GUEST_GUIDE_VERSION)
  assert.equal(hasCompletedGuestGuide('preparation', storage), true)
  assert.equal(hasCompletedGuestGuide('live', storage), false)

  completeGuestGuide('live', storage)
  assert.equal(values.get(GUEST_GUIDE_STORAGE_KEYS.live), GUEST_GUIDE_VERSION)
  assert.equal(hasCompletedGuestGuide('live', storage), true)
})

test('the first-use guide presents preparation and live modules and can be replayed', () => {
  const guide = read('src/features/onboarding/GuestWelcomeGuide.tsx')
  const shell = read('src/features/guest/GuestShell.tsx')
  const identity = read('src/features/identity/PartyIdentityUI.tsx')

  for (const label of ['Bienvenue', 'Jouer', 'Photos', 'Musique']) {
    assert.match(guide, new RegExp(`eyebrow: '${label}'`))
  }
  for (const visual of ['home', 'games', 'photos', 'music']) {
    assert.match(guide, new RegExp(`visual: '${visual}'`))
  }
  for (const visual of ['prepare-home', 'prepare-info', 'prepare-bring', 'prepare-chat', 'prepare-guests', 'prepare-app']) {
    assert.match(guide, new RegExp(`visual: '${visual}'`))
  }
  assert.match(guide, /Installer l’application/)
  assert.match(guide, /Activer les notifications/)

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
  assert.match(guide, /phase === 'preparation' \? preparationSlides : liveSlides/)
  assert.match(shell, /settings\.phase === 'preparation' \|\| settings\.phase === 'live'/)
  assert.match(shell, /phase=\{guidePhase\}/)
  assert.match(shell, /enabled=\{!loading && !isAdmin && Boolean\(identity\)/)
  assert.match(identity, /Revoir le guide/)
})
