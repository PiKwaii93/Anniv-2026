import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'

import { useAuth } from '../features/auth/AuthContext'
import { supabase } from '../lib/supabase'

import './CaptainJoin.css'

const captainTokenPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function captainError(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error && 'message' in error
      ? String(error.message)
      : ''

  if (message.includes('INVITE_EXPIRED')) return 'Ce lien a expiré ou a été remplacé. Demande un nouveau lien à l’organisateur.'
  if (message.includes('OWNER_ACCOUNT')) return 'Le compte propriétaire ne peut pas utiliser une invitation capitaine.'
  if (message.includes('PERMANENT_ACCOUNT_REQUIRED')) return 'Crée un compte avec ton adresse e-mail pour accepter cette invitation.'
  return 'L’accès capitaine n’a pas pu être activé. Réessaie dans quelques instants.'
}

export default function CaptainJoin() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const validToken = captainTokenPattern.test(token)
  const { user, isAdmin, loading, signIn, signOut } = useAuth()
  const [mode, setMode] = useState<'signup' | 'signin'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const acceptingRef = useRef(false)
  const userId = user?.id

  const acceptInvite = useCallback(async () => {
    if (!validToken || acceptingRef.current) return
    acceptingRef.current = true
    setBusy(true)
    setError('')

    const { error: acceptError } = await supabase.rpc(
      'accept_party_captain_invite',
      { p_token: token },
    )

    if (acceptError) {
      setError(captainError(acceptError))
      setBusy(false)
      acceptingRef.current = false
      return
    }

    window.location.assign('/admin')
  }, [token, validToken])

  useEffect(() => {
    if (!loading && userId && !isAdmin && validToken) {
      void acceptInvite()
    }
  }, [acceptInvite, isAdmin, loading, userId, validToken])

  if (!loading && isAdmin) {
    return <Navigate to="/admin" replace />
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!validToken) return
    setBusy(true)
    setError('')
    setNotice('')

    if (mode === 'signin') {
      const result = await signIn(email.trim(), password)
      if (result.error) {
        setError('Email ou mot de passe incorrect.')
        setBusy(false)
        return
      }
      await acceptInvite()
      return
    }

    const redirectUrl = `${window.location.origin}/captain?token=${encodeURIComponent(token)}`
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: redirectUrl },
    })

    if (signUpError) {
      setError(signUpError.message.toLowerCase().includes('already')
        ? 'Un compte existe déjà avec cette adresse. Choisis « J’ai déjà un compte ».'
        : 'Le compte n’a pas pu être créé. Vérifie l’adresse et utilise au moins 8 caractères.')
      setBusy(false)
      return
    }

    if (data.session) {
      await acceptInvite()
      return
    }

    setNotice('Compte créé. Ouvre l’e-mail de confirmation sur ce téléphone pour terminer l’activation.')
    setBusy(false)
  }

  return (
    <main className="captain-join">
      <Link to="/" className="back-link">← Accueil</Link>
      <section className="captain-join__card">
        <p className="captain-join__eyebrow">Anniv 2026 / équipe</p>
        <span className="captain-join__icon" aria-hidden="true">★</span>
        <h1>Accès capitaine</h1>
        <p className="captain-join__lead">
          Ton accès personnel pour piloter la soirée depuis ton téléphone.
        </p>

        {!validToken ? (
          <div className="captain-join__message captain-join__message--error" role="alert">
            Ce lien d’invitation est incomplet. Demande un nouveau lien à l’organisateur.
          </div>
        ) : user && !isAdmin ? (
          <div className="captain-join__activation" aria-live="polite">
            <span className="captain-join__spinner" />
            <strong>Activation de ton rôle…</strong>
            <p>Le lien est associé à ton compte.</p>
            {error && <p className="captain-join__message captain-join__message--error" role="alert">{error}</p>}
            {error && <button type="button" onClick={() => void signOut()}>Utiliser un autre compte</button>}
          </div>
        ) : (
          <>
            <div className="captain-join__switch" aria-label="Type de connexion">
              <button type="button" aria-pressed={mode === 'signup'} onClick={() => { setMode('signup'); setError(''); setNotice('') }}>
                Créer mon accès
              </button>
              <button type="button" aria-pressed={mode === 'signin'} onClick={() => { setMode('signin'); setError(''); setNotice('') }}>
                J’ai déjà un compte
              </button>
            </div>

            <form onSubmit={submit} className="captain-join__form">
              <label>
                Adresse e-mail
                <input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} />
              </label>
              <label>
                Mot de passe
                <input type="password" minLength={8} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required value={password} onChange={event => setPassword(event.target.value)} />
              </label>
              {error && <p className="captain-join__message captain-join__message--error" role="alert">{error}</p>}
              {notice && <p className="captain-join__message captain-join__message--success" role="status">{notice}</p>}
              <button className="captain-join__submit" type="submit" disabled={busy}>
                {busy ? 'Activation…' : mode === 'signup' ? 'Créer et devenir capitaine' : 'Se connecter et accepter'}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  )
}
