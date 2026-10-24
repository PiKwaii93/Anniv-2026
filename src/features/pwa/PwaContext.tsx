import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { PwaContext, type IosBrowser, type PwaContextValue } from './PwaState'

type InstallChoice = { outcome: 'accepted' | 'dismissed'; platform: string }

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<InstallChoice>
}

const DISMISSED_KEY = 'anniv-2026-pwa-install-dismissed-v1'

function getEnvironment() {
  if (typeof window === 'undefined') {
    return { installed: false, platform: 'other' as const, iosBrowser: 'other' as const }
  }

  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
  const installed = window.matchMedia('(display-mode: standalone)').matches
    || navigatorWithStandalone.standalone === true
  const userAgent = navigator.userAgent
  const ios = /iPad|iPhone|iPod/.test(userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const android = /Android/i.test(userAgent)

  let iosBrowser: IosBrowser = 'other'
  if (ios) {
    if (/CriOS/i.test(userAgent)) iosBrowser = 'chrome'
    else if (/FxiOS/i.test(userAgent)) iosBrowser = 'firefox'
    else if (/EdgiOS/i.test(userAgent)) iosBrowser = 'edge'
    else if (/Safari/i.test(userAgent)) iosBrowser = 'safari'
  }

  return {
    installed,
    platform: ios ? 'ios' as const : android ? 'android' as const : 'other' as const,
    iosBrowser,
  }
}

export function PwaProvider({ children }: { children: ReactNode }) {
  const environment = useMemo(() => getEnvironment(), [])
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(environment.installed)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.localStorage.getItem(DISMISSED_KEY) === '1'
    } catch {
      return false
    }
  })
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const waitingWorker = useRef<ServiceWorker | null>(null)
  const reloadRequested = useRef(false)

  useEffect(() => {
    const captureInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }
    const markInstalled = () => {
      setInstalled(true)
      setInstallPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', captureInstallPrompt)
    window.addEventListener('appinstalled', markInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', captureInstallPrompt)
      window.removeEventListener('appinstalled', markInstalled)
    }
  }, [])

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

    let disposed = false
    let registration: ServiceWorkerRegistration | null = null
    let updateFoundHandler: (() => void) | null = null

    const inspectRegistration = (nextRegistration: ServiceWorkerRegistration) => {
      registration = nextRegistration
      if (nextRegistration.waiting && navigator.serviceWorker.controller) {
        waitingWorker.current = nextRegistration.waiting
        setUpdateAvailable(true)
      }

      updateFoundHandler = () => {
        const worker = nextRegistration.installing
        if (!worker) return
        worker.addEventListener('statechange', () => {
          if (!disposed && worker.state === 'installed' && navigator.serviceWorker.controller) {
            waitingWorker.current = worker
            setUpdateAvailable(true)
          }
        })
      }
      nextRegistration.addEventListener('updatefound', updateFoundHandler)
    }

    const onControllerChange = () => {
      if (reloadRequested.current) window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    const registerWorker = async () => {
      try {
        const nextRegistration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
        if (!disposed) inspectRegistration(nextRegistration)
      } catch (error) {
        console.warn('[PWA] Le service worker n’a pas pu être enregistré.', error)
      }
    }
    void registerWorker()

    const checkForUpdate = () => {
      if (document.visibilityState === 'visible') {
        void registration?.update().catch(() => undefined)
      }
    }
    document.addEventListener('visibilitychange', checkForUpdate)

    return () => {
      disposed = true
      if (registration && updateFoundHandler) {
        registration.removeEventListener('updatefound', updateFoundHandler)
      }
      document.removeEventListener('visibilitychange', checkForUpdate)
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])

  const dismissInstall = useCallback(() => {
    setDismissed(true)
    try {
      window.localStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      // The choice remains dismissed for this page when storage is unavailable.
    }
  }, [])

  const install = useCallback(async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    setInstallPrompt(null)
    if (choice.outcome === 'dismissed') dismissInstall()
  }, [dismissInstall, installPrompt])

  const applyUpdate = useCallback(() => {
    const worker = waitingWorker.current
    if (!worker) return
    reloadRequested.current = true
    worker.postMessage({ type: 'SKIP_WAITING' })
  }, [])

  const value = useMemo<PwaContextValue>(() => ({
    canInstall: Boolean(installPrompt),
    dismissed,
    installed,
    iosBrowser: environment.iosBrowser,
    platform: environment.platform,
    updateAvailable,
    applyUpdate,
    dismissInstall,
    install,
  }), [applyUpdate, dismissInstall, dismissed, environment, install, installPrompt, installed, updateAvailable])

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>
}
