import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import type {
  Session,
  User,
} from '@supabase/supabase-js'

import { supabase } from '../../lib/supabase'

type SignInResult = {
  error: string | null
}

type AuthContextValue = {
  session: Session | null
  user: User | null
  isAdmin: boolean
  loading: boolean
  signIn: (
    email: string,
    password: string,
  ) => Promise<SignInResult>
  signOut: () => Promise<void>
}

const AuthContext =
  createContext<AuthContextValue | undefined>(
    undefined,
  )

export function AuthProvider({
  children,
}: {
  children: ReactNode
}) {
  const [session, setSession] =
    useState<Session | null>(null)

  const [initialized, setInitialized] =
    useState(false)

  const [isAdmin, setIsAdmin] =
    useState(false)

  const [adminLoading, setAdminLoading] =
    useState(true)

  const currentUserIdRef =
    useRef<string | null>(null)

  useEffect(() => {
    let mounted = true

    const applySession = (
      nextSession: Session | null,
    ) => {
      if (!mounted) {
        return
      }

      const nextUserId =
        nextSession?.user.id ?? null

      const identityChanged =
        currentUserIdRef.current !== nextUserId

      currentUserIdRef.current = nextUserId

      if (identityChanged) {
        setIsAdmin(false)
        setAdminLoading(Boolean(nextUserId))
      } else if (!nextUserId) {
        setIsAdmin(false)
        setAdminLoading(false)
      }

      setSession(nextSession)
      setInitialized(true)
    }

    const initializeSession = async () => {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession()

      applySession(currentSession)
    }

    void initializeSession()

    const {
      data: { subscription },
    } =
      supabase.auth.onAuthStateChange(
        (_event, nextSession) => {
          applySession(nextSession)
        },
      )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!initialized) {
      return
    }

    const userId = session?.user.id

    if (!userId) {
      setIsAdmin(false)
      setAdminLoading(false)
      return
    }

    let cancelled = false

    const checkAdmin = async () => {
      setAdminLoading(true)

      const { data, error } = await supabase
        .from('app_admins')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle()

      if (cancelled) {
        return
      }

      if (error) {
        console.error(
          'Unable to check admin status:',
          error,
        )

        setIsAdmin(false)
        setAdminLoading(false)

        return
      }

      setIsAdmin(Boolean(data))
      setAdminLoading(false)
    }

    void checkAdmin()

    return () => {
      cancelled = true
    }
  }, [
    initialized,
    session?.user.id,
  ])

  const signIn = async (
    email: string,
    password: string,
  ): Promise<SignInResult> => {
    const { error } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      })

    if (error) {
      return {
        error: error.message,
      }
    }

    return {
      error: null,
    }
  }

  const signOut = async () => {
    const { error } =
      await supabase.auth.signOut()

    if (error) {
      console.error(
        'Unable to sign out:',
        error,
      )
    }
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        isAdmin,
        loading:
          !initialized || adminLoading,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error(
      'useAuth must be used inside AuthProvider',
    )
  }

  return context
}
