import { useSyncExternalStore } from 'react'

function subscribe(notify: () => void) {
  window.addEventListener('online', notify)
  window.addEventListener('offline', notify)
  return () => {
    window.removeEventListener('online', notify)
    window.removeEventListener('offline', notify)
  }
}

const getSnapshot = () => window.navigator.onLine
const getServerSnapshot = () => true

export default function ConnectionNotice() {
  // This reports the device's network signal, not backend health. Never replay
  // a vote, upload or Spotify command when the network comes back.
  const online = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return <div className="guest-connection" role="status" aria-live="polite" aria-atomic="true">
    {!online && <>Connexion perdue. Les envois nécessitent Internet ; garde cette page ouverte.</>}
  </div>
}
