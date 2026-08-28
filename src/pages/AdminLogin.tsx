import {
  useState,
  type FormEvent,
} from 'react'

import {
  Link,
  Navigate,
  useLocation,
} from 'react-router-dom'

import { useAuth } from '../features/auth/AuthContext'

import './AdminLogin.css'

type LoginLocationState = {
  from?: string
}

function AdminLogin() {
  const location = useLocation()

  const {
    user,
    isAdmin,
    loading,
    signIn,
    signOut,
  } = useAuth()

  const [email, setEmail] =
    useState('')

  const [password, setPassword] =
    useState('')

  const [error, setError] =
    useState('')

  const [submitting, setSubmitting] =
    useState(false)

  const locationState =
    location.state as LoginLocationState | null

  const requestedPath =
    locationState?.from

  const redirectPath =
    requestedPath?.startsWith('/admin') &&
    requestedPath !== '/admin/login'
      ? requestedPath
      : '/admin'

  if (loading) {
    return (
      <main className="admin-login">
        <div className="admin-login__card">
          <p className="admin-login__eyebrow">
            Anniv 2026
          </p>

          <h1>Connexion</h1>

          <p className="admin-login__description">
            Vérification de la session...
          </p>
        </div>
      </main>
    )
  }

  if (isAdmin) {
    return (
      <Navigate
        to={redirectPath}
        replace
      />
    )
  }

  if (user && !isAdmin) {
    return (
      <main className="admin-login">
        <Link
          to="/"
          className="back-link"
        >
          ← Accueil
        </Link>

        <div className="admin-login__card">
          <p className="admin-login__eyebrow">
            Accès refusé
          </p>

          <h1>Pas admin.</h1>

          <p className="admin-login__description">
            Ce compte ne possède pas les
            droits d&apos;administration.
          </p>

          <button
            type="button"
            className="admin-login__submit"
            onClick={() => {
              void signOut()
            }}
          >
            Se déconnecter
          </button>
        </div>
      </main>
    )
  }

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()

    setError('')
    setSubmitting(true)

    const result = await signIn(
      email.trim(),
      password,
    )

    if (result.error) {
      setError(
        'Email ou mot de passe incorrect.',
      )
    }

    setSubmitting(false)
  }

  return (
    <main className="admin-login">
      <Link
        to="/"
        className="back-link"
      >
        ← Accueil
      </Link>

      <div className="admin-login__card">
        <p className="admin-login__eyebrow">
          Anniv 2026 / privé
        </p>

        <h1>Administration</h1>

        <p className="admin-login__description">
          Connecte-toi pour gérer la soirée.
        </p>

        <form
          className="admin-login__form"
          onSubmit={handleSubmit}
        >
          <label>
            Email

            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) =>
                setEmail(
                  event.target.value,
                )
              }
              required
            />
          </label>

          <label>
            Mot de passe

            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) =>
                setPassword(
                  event.target.value,
                )
              }
              required
            />
          </label>

          {error && (
            <p
              className="admin-login__error"
              role="alert"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            className="admin-login__submit"
            disabled={submitting}
          >
            {submitting
              ? 'Connexion...'
              : 'Se connecter'}
          </button>
        </form>
      </div>
    </main>
  )
}

export default AdminLogin
