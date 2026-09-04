import { supabase } from '../../lib/supabase'

export type ResetReceipt = { id: string | null; epoch?: number; created_at?: string; pending: number; paths: string[] }
export const RESET_REQUEST_KEY = 'anniv-2026-admin-reset-request'
export const DATA_EPOCH_KEY = 'anniv-2026-data-epoch'

export function clearGuestData(storage: Storage) {
  const exact = new Set(['anniv-2026-bingo-v1', 'anniv-2026-party-identity-v1', 'anniv-2026-secret-mission-identity-v1', 'anniv-2026-live-vote-identity-v1'])
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i))
  for (const key of keys) if (key && (exact.has(key) || key.startsWith('anniv-2026-mission-resume:') || key.startsWith('anniv-2026-capsule-draft-v1:'))) storage.removeItem(key)
}

export function acceptDataEpoch(epoch: number, storage: Storage, session: Storage, memoryEpoch: number | null = null): boolean {
  const previous = storage.getItem(DATA_EPOCH_KEY)
  const changed = (memoryEpoch !== null && memoryEpoch !== epoch) || (previous !== String(epoch) && (previous !== null || epoch > 0))
  if (changed) {
    clearGuestData(storage)
    session.removeItem('anniv2026:credits-done')
  }
  storage.setItem(DATA_EPOCH_KEY, String(epoch))
  return changed
}

function receipt(data: unknown): ResetReceipt {
  if (!data || typeof data !== 'object' || !('id' in data) || !('pending' in data) || !('paths' in data)
    || !(data.id === null || typeof data.id === 'string') || typeof data.pending !== 'number' || data.pending < 0
    || !Array.isArray(data.paths) || !data.paths.every(p => typeof p === 'string')) throw new Error('INVALID_RECEIPT')
  return data as ResetReceipt
}

export async function getResetStatus(id: string | null = null) {
  const { data, error } = await supabase.rpc('admin_party_reset_status', { p_request: id })
  if (error) throw error
  return receipt(data)
}

export async function resetPartyData(id: string) {
  const { data, error } = await supabase.rpc('admin_reset_party_data', { p_request: id, p_confirmation: 'EFFACER' })
  if (error) throw error
  const result = receipt(data)
  if (result.id !== id) throw new Error('INVALID_RECEIPT')
  return result
}

export async function cleanResetPhotos(initial: ResetReceipt, progress: (r: ResetReceipt) => void) {
  let current = initial
  while (current.pending > 0 && current.id) {
    if (!current.paths.length) throw new Error('PHOTO_CLEANUP_STALLED')
    const { error } = await supabase.storage.from('photo-hunt').remove(current.paths)
    if (error) throw error
    const { data, error: ackError } = await supabase.rpc('admin_ack_party_reset_photos', { p_request: current.id, p_paths: current.paths })
    if (ackError) throw ackError
    const next = receipt(data)
    if (next.id !== current.id || next.pending >= current.pending) throw new Error('PHOTO_CLEANUP_STALLED')
    current = next
    progress(current)
  }
  return current
}
