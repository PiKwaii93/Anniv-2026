import { createContext, useContext } from 'react'

export type PwaPlatform = 'android' | 'ios' | 'other'
export type IosBrowser = 'safari' | 'chrome' | 'firefox' | 'edge' | 'other'

export type PwaContextValue = {
  canInstall: boolean
  dismissed: boolean
  installed: boolean
  iosBrowser: IosBrowser
  platform: PwaPlatform
  updateAvailable: boolean
  applyUpdate: () => void
  dismissInstall: () => void
  install: () => Promise<void>
}

const defaultValue: PwaContextValue = {
  canInstall: false,
  dismissed: false,
  installed: false,
  iosBrowser: 'other',
  platform: 'other',
  updateAvailable: false,
  applyUpdate: () => undefined,
  dismissInstall: () => undefined,
  install: async () => undefined,
}

export const PwaContext = createContext<PwaContextValue>(defaultValue)

export function usePwa() {
  return useContext(PwaContext)
}

export function useRequiresIosInstallation() {
  const { installed, platform } = usePwa()
  return platform === 'ios' && !installed
}
