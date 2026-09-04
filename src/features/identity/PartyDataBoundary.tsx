import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { acceptDataEpoch } from './partyDataReset'

// Kept outside identity/game providers: old local data must not be restored
// before we know which party generation it belongs to. Admin auth stays outside.
export default function PartyDataBoundary({ children }: { children: ReactNode }) {
  const [epoch, setEpoch] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const memoryEpoch = useRef<number | null>(null)
  const adminPage = useLocation().pathname.startsWith('/admin')
  useEffect(() => {
    let active = true
    let running = false
    let request: AbortController | null = null
    async function check() {
      if (running || document.visibilityState === 'hidden') return
      running = true
      request = new AbortController()
      const timeout = window.setTimeout(() => request?.abort(), 8000)
      try {
        const { data, error } = await supabase.rpc('party_data_epoch').abortSignal(request.signal)
        if (!active) return
        if (error || !Number.isSafeInteger(data) || data < 0) throw error ?? new Error('Invalid epoch')
        try { acceptDataEpoch(data, window.localStorage, window.sessionStorage, memoryEpoch.current) } catch { /* Memory still remounts if storage is unavailable. */ }
        memoryEpoch.current = data
        setEpoch(data)
        setFailed(false)
      } catch {
        if (active) setFailed(true)
      } finally {
        window.clearTimeout(timeout)
        running = false
      }
    }
    void check()
    const interval = window.setInterval(() => void check(), 10000)
    const wake = () => void check()
    window.addEventListener('focus', wake)
    window.addEventListener('online', wake)
    window.addEventListener('storage', wake)
    document.addEventListener('visibilitychange', wake)
    return () => {
      active = false
      request?.abort()
      window.clearInterval(interval)
      window.removeEventListener('focus', wake)
      window.removeEventListener('online', wake)
      window.removeEventListener('storage', wake)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [retry])
  // Do not interrupt the admin's Storage cleanup when the epoch changes.
  if (!adminPage && epoch === null) return <main style={{ padding: '32px', maxWidth: '600px', margin: 'auto' }} aria-busy={!failed}>
    <p role={failed ? 'alert' : 'status'}>{failed ? 'Connexion à la soirée impossible. Réessaie pour retrouver les données à jour.' : 'Connexion à la soirée…'}</p>
    {failed && <button type="button" onClick={() => { setFailed(false); setRetry(v => v + 1) }}>Réessayer</button>}
  </main>
  return <Fragment key={adminPage ? 'admin' : epoch}>{children}</Fragment>
}
