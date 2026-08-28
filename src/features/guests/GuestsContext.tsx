import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { useAuth } from '../auth/AuthContext'
import { supabase } from '../../lib/supabase'

import type {
  Guest,
  GuestStatus,
  PlusOne,
} from './types'

type GuestInput = Omit<
  Guest,
  'id' | 'createdAt'
>

type GuestPatch = Partial<
  Pick<
    Guest,
    'name' | 'status' | 'plusOnes' | 'notes'
  >
>

type GuestsContextValue = {
  guests: Guest[]
  loading: boolean
  synchronizationError: string
  addGuest: (guest: GuestInput) => void
  updateGuest: (
    id: string,
    data: GuestPatch,
  ) => void
  removeGuest: (id: string) => void
}

type GuestRow = {
  id: string
  name: string
  status: GuestStatus
  created_at: string
}

type PlusOneRow = {
  id: string
  guest_id: string
  name: string
  created_at: string
}

type PrivateNoteRow = {
  guest_id: string
  notes: string
}

const GuestsContext =
  createContext<GuestsContextValue | undefined>(
    undefined,
  )

export function GuestsProvider({
  children,
}: {
  children: ReactNode
}) {
  const { isAdmin, loading: authLoading } =
    useAuth()

  const [guests, setGuests] = useState<
    Guest[]
  >([])

  const [loading, setLoading] =
    useState(true)

  const [
    synchronizationError,
    setSynchronizationError,
  ] = useState('')

  const guestsRef = useRef<Guest[]>([])

  const writeQueueRef =
    useRef<Promise<void>>(
      Promise.resolve(),
    )

  const pendingWritesRef = useRef(0)
  const deferredRefreshRef = useRef(false)
  const loadRequestRef = useRef(0)

  const replaceGuests = useCallback(
    (nextGuests: Guest[]) => {
      guestsRef.current = nextGuests
      setGuests(nextGuests)
    },
    [],
  )

  const loadGuests = useCallback(
    async () => {
      const requestId =
        ++loadRequestRef.current

      const [
        guestsResult,
        plusOnesResult,
      ] = await Promise.all([
        supabase
          .from('guests')
          .select(
            'id, name, status, created_at',
          )
          .order('created_at', {
            ascending: true,
          }),

        supabase
          .from('plus_ones')
          .select(
            'id, guest_id, name, created_at',
          )
          .order('created_at', {
            ascending: true,
          }),
      ])

      if (
        requestId !==
        loadRequestRef.current
      ) {
        return
      }

      if (guestsResult.error) {
        console.error(
          'Unable to load guests:',
          guestsResult.error,
        )

        setSynchronizationError(
          'Impossible de synchroniser les invités.',
        )
        setLoading(false)

        return
      }

      if (plusOnesResult.error) {
        console.error(
          'Unable to load plus ones:',
          plusOnesResult.error,
        )

        setSynchronizationError(
          'Impossible de synchroniser les +1.',
        )
        setLoading(false)

        return
      }

      const guestRows =
        (guestsResult.data ??
          []) as GuestRow[]

      const plusOneRows =
        (plusOnesResult.data ??
          []) as PlusOneRow[]

      let privateNoteRows:
        PrivateNoteRow[] = []

      let notesLoadFailed = false

      if (isAdmin) {
        const notesResult =
          await supabase
            .from(
              'guest_private_notes',
            )
            .select(
              'guest_id, notes',
            )

        if (
          requestId !==
          loadRequestRef.current
        ) {
          return
        }

        if (notesResult.error) {
          console.error(
            'Unable to load private notes:',
            notesResult.error,
          )

          notesLoadFailed = true
        } else {
          privateNoteRows =
            (notesResult.data ??
              []) as PrivateNoteRow[]
        }
      }

      if (
        pendingWritesRef.current > 0
      ) {
        deferredRefreshRef.current = true
        return
      }

      const plusOnesByGuest =
        new Map<string, PlusOne[]>()

      for (const plusOne of plusOneRows) {
        const current =
          plusOnesByGuest.get(
            plusOne.guest_id,
          ) ?? []

        current.push({
          id: plusOne.id,
          name: plusOne.name,
        })

        plusOnesByGuest.set(
          plusOne.guest_id,
          current,
        )
      }

      const notesByGuest =
        new Map<string, string>()

      for (const privateNote of privateNoteRows) {
        notesByGuest.set(
          privateNote.guest_id,
          privateNote.notes,
        )
      }

      const mappedGuests: Guest[] =
        guestRows.map((guest) => ({
          id: guest.id,
          name: guest.name,
          status: guest.status,
          plusOnes:
            plusOnesByGuest.get(
              guest.id,
            ) ?? [],
          notes:
            notesByGuest.get(
              guest.id,
            ) ?? '',
          createdAt:
            guest.created_at,
        }))

      replaceGuests(mappedGuests)

      setSynchronizationError(
        notesLoadFailed
          ? 'Les notes privées n’ont pas pu être synchronisées.'
          : '',
      )

      setLoading(false)
    },
    [isAdmin, replaceGuests],
  )

  const requestRefresh = useCallback(
    () => {
      if (
        pendingWritesRef.current > 0
      ) {
        deferredRefreshRef.current = true
        return
      }

      void loadGuests()
    },
    [loadGuests],
  )

  const queueWrite = useCallback(
    (
      operation: () => Promise<void>,
    ) => {
      pendingWritesRef.current += 1

      writeQueueRef.current =
        writeQueueRef.current
          .then(operation)
          .catch((writeError) => {
            console.error(
              'Unable to save guest data:',
              writeError,
            )

            setSynchronizationError(
              'Une modification n’a pas pu être synchronisée.',
            )

            deferredRefreshRef.current = true
          })
          .finally(() => {
            pendingWritesRef.current -= 1

            if (
              pendingWritesRef.current === 0 &&
              deferredRefreshRef.current
            ) {
              deferredRefreshRef.current = false
              void loadGuests()
            }
          })
    },
    [loadGuests],
  )

  useEffect(() => {
    if (authLoading) {
      return
    }

    void loadGuests()
  }, [
    authLoading,
    isAdmin,
    loadGuests,
  ])

  useEffect(() => {
    if (authLoading) {
      return
    }

    const channel = supabase
      .channel(
        'anniv-2026-guests-live',
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'guests',
        },
        requestRefresh,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'plus_ones',
        },
        requestRefresh,
      )
      .subscribe()

    const refreshInterval =
      window.setInterval(
        requestRefresh,
        15000,
      )

    const handleVisibilityChange =
      () => {
        if (
          document.visibilityState ===
          'visible'
        ) {
          requestRefresh()
        }
      }

    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange,
    )

    return () => {
      window.clearInterval(
        refreshInterval,
      )

      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      )

      void supabase.removeChannel(
        channel,
      )
    }
  }, [
    authLoading,
    requestRefresh,
  ])

  const addGuest = (
    guest: GuestInput,
  ) => {
    if (!isAdmin) {
      console.error(
        'Only an admin can add guests.',
      )

      return
    }

    const cleanName = guest.name.trim()

    if (!cleanName) {
      return
    }

    const cleanPlusOnes =
      guest.plusOnes
        .map((plusOne) => ({
          ...plusOne,
          name: plusOne.name.trim(),
        }))
        .filter(
          (plusOne) =>
            plusOne.name.length > 0,
        )

    const cleanNotes = guest.notes.trim()

    const id = crypto.randomUUID()
    const createdAt =
      new Date().toISOString()

    const newGuest: Guest = {
      id,
      name: cleanName,
      status: guest.status,
      plusOnes: cleanPlusOnes,
      notes: cleanNotes,
      createdAt,
    }

    const nextGuests = [
      ...guestsRef.current,
      newGuest,
    ]

    replaceGuests(nextGuests)

    queueWrite(async () => {
      const guestResult =
        await supabase
          .from('guests')
          .insert({
            id,
            name: cleanName,
            status: guest.status,
            created_at: createdAt,
          })

      if (guestResult.error) {
        throw guestResult.error
      }

      if (cleanPlusOnes.length > 0) {
        const plusOneResult =
          await supabase
            .from('plus_ones')
            .insert(
              cleanPlusOnes.map(
                (plusOne) => ({
                  id: plusOne.id,
                  guest_id: id,
                  name: plusOne.name,
                }),
              ),
            )

        if (plusOneResult.error) {
          await supabase
            .from('guests')
            .delete()
            .eq('id', id)

          throw plusOneResult.error
        }
      }

      const notesResult =
        await supabase
          .from(
            'guest_private_notes',
          )
          .insert({
            guest_id: id,
            notes: cleanNotes,
          })

      if (notesResult.error) {
        await supabase
          .from('guests')
          .delete()
          .eq('id', id)

        throw notesResult.error
      }
    })
  }

  const updateGuest = (
    id: string,
    data: GuestPatch,
  ) => {
    if (!isAdmin) {
      console.error(
        'Only an admin can update guests.',
      )

      return
    }

    const previousGuest =
      guestsRef.current.find(
        (guest) => guest.id === id,
      )

    if (!previousGuest) {
      return
    }

    const normalizedData: GuestPatch = {}

    if (data.name !== undefined) {
      const cleanName = data.name.trim()

      if (cleanName) {
        normalizedData.name = cleanName
      }
    }

    if (data.status !== undefined) {
      normalizedData.status = data.status
    }

    if (data.notes !== undefined) {
      normalizedData.notes =
        data.notes.trim()
    }

    if (data.plusOnes !== undefined) {
      normalizedData.plusOnes =
        data.plusOnes
          .map((plusOne) => ({
            ...plusOne,
            name: plusOne.name.trim(),
          }))
          .filter(
            (plusOne) =>
              plusOne.name.length > 0,
          )
    }

    if (
      Object.keys(normalizedData)
        .length === 0
    ) {
      return
    }

    const nextGuest: Guest = {
      ...previousGuest,
      ...normalizedData,
    }

    const nextGuests =
      guestsRef.current.map((guest) =>
        guest.id === id
          ? nextGuest
          : guest,
      )

    replaceGuests(nextGuests)

    queueWrite(async () => {
      const guestPatch: {
        name?: string
        status?: GuestStatus
      } = {}

      if (
        normalizedData.name !== undefined
      ) {
        guestPatch.name =
          normalizedData.name
      }

      if (
        normalizedData.status !== undefined
      ) {
        guestPatch.status =
          normalizedData.status
      }

      if (
        Object.keys(guestPatch)
          .length > 0
      ) {
        const guestResult =
          await supabase
            .from('guests')
            .update(guestPatch)
            .eq('id', id)

        if (guestResult.error) {
          throw guestResult.error
        }
      }

      if (
        normalizedData.notes !== undefined
      ) {
        const notesResult =
          await supabase
            .from(
              'guest_private_notes',
            )
            .upsert(
              {
                guest_id: id,
                notes:
                  normalizedData.notes,
              },
              {
                onConflict:
                  'guest_id',
              },
            )

        if (notesResult.error) {
          throw notesResult.error
        }
      }

      if (
        normalizedData.plusOnes !== undefined
      ) {
        const nextPlusOnes =
          normalizedData.plusOnes

        const nextIds = new Set(
          nextPlusOnes.map(
            (plusOne) =>
              plusOne.id,
          ),
        )

        const removedIds =
          previousGuest.plusOnes
            .filter(
              (plusOne) =>
                !nextIds.has(
                  plusOne.id,
                ),
            )
            .map(
              (plusOne) =>
                plusOne.id,
            )

        if (removedIds.length > 0) {
          const deleteResult =
            await supabase
              .from('plus_ones')
              .delete()
              .in(
                'id',
                removedIds,
              )

          if (deleteResult.error) {
            throw deleteResult.error
          }
        }

        if (nextPlusOnes.length > 0) {
          const plusOneResult =
            await supabase
              .from('plus_ones')
              .upsert(
                nextPlusOnes.map(
                  (plusOne) => ({
                    id: plusOne.id,
                    guest_id: id,
                    name: plusOne.name,
                  }),
                ),
                {
                  onConflict: 'id',
                },
              )

          if (plusOneResult.error) {
            throw plusOneResult.error
          }
        }
      }
    })
  }

  const removeGuest = (
    id: string,
  ) => {
    if (!isAdmin) {
      console.error(
        'Only an admin can remove guests.',
      )

      return
    }

    if (
      !guestsRef.current.some(
        (guest) => guest.id === id,
      )
    ) {
      return
    }

    replaceGuests(
      guestsRef.current.filter(
        (guest) => guest.id !== id,
      ),
    )

    queueWrite(async () => {
      const { error } =
        await supabase
          .from('guests')
          .delete()
          .eq('id', id)

      if (error) {
        throw error
      }
    })
  }

  return (
    <GuestsContext.Provider
      value={{
        guests,
        loading,
        synchronizationError,
        addGuest,
        updateGuest,
        removeGuest,
      }}
    >
      {children}
    </GuestsContext.Provider>
  )
}

export function useGuests() {
  const context =
    useContext(GuestsContext)

  if (!context) {
    throw new Error(
      'useGuests must be used inside GuestsProvider',
    )
  }

  return context
}
