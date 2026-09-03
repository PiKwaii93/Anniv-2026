import { createContext, useContext } from 'react'
import type { ExtrasState } from '../party-extras/model'
import type { GuestRoom } from './useLiveRoom'

export const GuestContext = createContext<{ extras: ExtrasState | null; room: GuestRoom | null }>({ extras: null, room: null })
export const useGuestOverview = () => useContext(GuestContext)
