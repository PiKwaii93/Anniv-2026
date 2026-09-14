export const GUEST_GUIDE_VERSION = '1'
export const GUEST_GUIDE_STORAGE_KEY = 'anniv-2026:guest-guide-version'
export const GUEST_GUIDE_REPLAY_EVENT = 'anniv-2026:replay-guest-guide'

type GuideStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export function hasCompletedGuestGuide(storage: GuideStorage = window.localStorage) {
  try {
    return storage.getItem(GUEST_GUIDE_STORAGE_KEY) === GUEST_GUIDE_VERSION
  } catch {
    return false
  }
}

export function completeGuestGuide(storage: GuideStorage = window.localStorage) {
  try {
    storage.setItem(GUEST_GUIDE_STORAGE_KEY, GUEST_GUIDE_VERSION)
  } catch {
    // The guide stays dismissible even when private storage is unavailable.
  }
}

export function requestGuestGuideReplay() {
  window.dispatchEvent(new Event(GUEST_GUIDE_REPLAY_EVENT))
}
