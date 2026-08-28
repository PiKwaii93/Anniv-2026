import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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

type GuestsContextValue = {
  guests: Guest[]
  addGuest: (guest: GuestInput) => void
  updateGuest: (
    id: string,
    data: Partial<Guest>,
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

  const loadGuests = useCallback(
    async () => {
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
            'id, guest_id, name',
          ),
      ])

      if (guestsResult.error) {
        console.error(
          'Unable to load guests:',
          guestsResult.error,
        )

        return
      }

      if (plusOnesResult.error) {
        console.error(
          'Unable to load plus ones:',
          plusOnesResult.error,
        )

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

      if (isAdmin) {
        const notesResult =
          await supabase
            .from(
              'guest_private_notes',
            )
            .select(
              'guest_id, notes',
            )

        if (notesResult.error) {
          console.error(
            'Unable to load private notes:',
            notesResult.error,
          )
        } else {
          privateNoteRows =
            (notesResult.data ??
              []) as PrivateNoteRow[]
        }
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

      setGuests(mappedGuests)
    },
    [isAdmin],
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
        () => {
          void loadGuests()
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'plus_ones',
        },
        () => {
          void loadGuests()
        },
      )
      .subscribe()

    const refreshInterval =
      window.setInterval(() => {
        void loadGuests()
      }, 15000)

    const handleVisibilityChange =
      () => {
        if (
          document.visibilityState ===
          'visible'
        ) {
          void loadGuests()
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
    loadGuests,
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

    const id = crypto.randomUUID()
    const createdAt =
      new Date().toISOString()

    const newGuest: Guest = {
      id,
      name: guest.name,
      status: guest.status,
      plusOnes: guest.plusOnes,
      notes: guest.notes,
      createdAt,
    }

    setGuests((currentGuests) => [
      ...currentGuests,
      newGuest,
    ])

    const saveGuest = async () => {
      const guestResult =
        await supabase
          .from('guests')
          .insert({
            id,
            name: guest.name,
            status: guest.status,
            created_at: createdAt,
          })

      if (guestResult.error) {
        console.error(
          'Unable to create guest:',
          guestResult.error,
        )

        await loadGuests()
        return
      }

      if (
        guest.plusOnes.length > 0
      ) {
        const plusOneResult =
          await supabase
            .from('plus_ones')
            .insert(
              guest.plusOnes.map(
                (plusOne) => ({
                  id: plusOne.id,
                  guest_id: id,
                  name: plusOne.name,
                }),
              ),
            )

        if (plusOneResult.error) {
          console.error(
            'Unable to create plus ones:',
            plusOneResult.error,
          )

          await supabase
            .from('guests')
            .delete()
            .eq('id', id)

          await loadGuests()
          return
        }
      }

      const notesResult =
        await supabase
          .from(
            'guest_private_notes',
          )
          .insert({
            guest_id: id,
            notes: guest.notes,
          })

      if (notesResult.error) {
        console.error(
          'Unable to create private note:',
          notesResult.error,
        )

        await supabase
          .from('guests')
          .delete()
          .eq('id', id)

        await loadGuests()
        return
      }

      await loadGuests()
    }

    void saveGuest()
  }

  const updateGuest = (
    id: string,
    data: Partial<Guest>,
  ) => {
    if (!isAdmin) {
      console.error(
        'Only an admin can update guests.',
      )

      return
    }

    const previousGuest =
      guests.find(
        (guest) => guest.id === id,
      )

    if (!previousGuest) {
      return
    }

    const nextGuest: Guest = {
      ...previousGuest,
      ...data,
    }

    setGuests((currentGuests) =>
      currentGuests.map((guest) =>
        guest.id === id
          ? nextGuest
          : guest,
      ),
    )

    const saveUpdate = async () => {
      const guestPatch: {
        name?: string
        status?: GuestStatus
      } = {}

      if (
        data.name !== undefined &&
        data.name.trim().length > 0
      ) {
        guestPatch.name =
          data.name.trim()
      }

      if (
        data.status !== undefined
      ) {
        guestPatch.status =
          data.status
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
          console.error(
            'Unable to update guest:',
            guestResult.error,
          )

          await loadGuests()
          return
        }
      }

      if (
        data.notes !== undefined
      ) {
        const notesResult =
          await supabase
            .from(
              'guest_private_notes',
            )
            .upsert(
              {
                guest_id: id,
                notes: data.notes,
              },
              {
                onConflict:
                  'guest_id',
              },
            )

        if (notesResult.error) {
          console.error(
            'Unable to update private note:',
            notesResult.error,
          )

          await loadGuests()
          return
        }
      }

      if (
        data.plusOnes !== undefined
      ) {
        const nextPlusOnes =
          data.plusOnes

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

        if (
          removedIds.length > 0
        ) {
          const deleteResult =
            await supabase
              .from('plus_ones')
              .delete()
              .in(
                'id',
                removedIds,
              )

          if (deleteResult.error) {
            console.error(
              'Unable to remove plus one:',
              deleteResult.error,
            )

            await loadGuests()
            return
          }
        }

        if (
          nextPlusOnes.length > 0
        ) {
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

          if (
            plusOneResult.error
          ) {
            console.error(
              'Unable to update plus ones:',
              plusOneResult.error,
            )

            await loadGuests()
            return
          }
        }
      }
    }

    void saveUpdate()
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

    setGuests((currentGuests) =>
      currentGuests.filter(
        (guest) =>
          guest.id !== id,
      ),
    )

    const deleteGuest =
      async () => {
        const { error } =
          await supabase
            .from('guests')
            .delete()
            .eq('id', id)

        if (error) {
          console.error(
            'Unable to delete guest:',
            error,
          )

          await loadGuests()
          return
        }

        await loadGuests()
      }

    void deleteGuest()
  }

  return (
    <GuestsContext.Provider
      value={{
        guests,
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