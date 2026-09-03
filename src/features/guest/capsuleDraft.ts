export type CapsuleDraft = { message: string; memory: string; prediction: string }
const maxAge = 7 * 24 * 60 * 60 * 1000
export const capsuleDraftKey = (playerKey: string) => `anniv-2026-capsule-draft-v1:${playerKey}`

export function readCapsuleDraft(storage: Storage, playerKey: string, savedAt: string | null, now = Date.now()): CapsuleDraft | null {
  try {
    const key = capsuleDraftKey(playerKey)
    const raw = storage.getItem(key)
    if (!raw) return null
    const value = JSON.parse(raw)
    if (value.version !== 1 || value.savedAt !== savedAt || !Number.isFinite(value.time) || value.time > now || now - value.time > maxAge ||
      typeof value.message !== 'string' || value.message.length > 1200 || typeof value.memory !== 'string' || value.memory.length > 800 || typeof value.prediction !== 'string' || value.prediction.length > 800) {
      storage.removeItem(key)
      return null
    }
    return { message: value.message, memory: value.memory, prediction: value.prediction }
  } catch { return null }
}

export function writeCapsuleDraft(storage: Storage, playerKey: string, savedAt: string | null, draft: CapsuleDraft) {
  try {
    storage.setItem(capsuleDraftKey(playerKey), JSON.stringify({ version: 1, savedAt, time: Date.now(), ...draft }))
    return true
  } catch { return false }
}
