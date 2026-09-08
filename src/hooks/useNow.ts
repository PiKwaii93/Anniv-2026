import { useEffect, useState } from 'react'

export function useNow(enabled: boolean, intervalMs = 1000) {
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    if (!enabled) return

    const tick = () => setNow(Date.now())
    const initial = window.setTimeout(tick, 0)
    const interval = window.setInterval(tick, intervalMs)

    return () => {
      window.clearTimeout(initial)
      window.clearInterval(interval)
    }
  }, [enabled, intervalMs])

  return now
}
