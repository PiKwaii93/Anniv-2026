const RESET_MARKER = 'anniv-2026-day-j-clean-state-v1'

const TEST_STORAGE_KEYS = [
  'anniv-2026-bingo-v1',
  'anniv-2026-party-identity-v1',
  'anniv-2026-secret-mission-identity-v1',
  'anniv-2026-live-vote-identity-v1',
] as const

export function applyDayJLocalReset() {
  try {
    if (window.localStorage.getItem(RESET_MARKER)) {
      return
    }

    TEST_STORAGE_KEYS.forEach((key) => {
      window.localStorage.removeItem(key)
    })

    window.localStorage.setItem(
      RESET_MARKER,
      new Date().toISOString(),
    )
  } catch (error) {
    console.error('Unable to clear pre-party local state:', error)
  }
}
