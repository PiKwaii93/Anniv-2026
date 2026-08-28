import {
  Link,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom'

import { useAuth } from './features/auth/AuthContext'

import Admin from './pages/Admin'
import AdminLogin from './pages/AdminLogin'
import BeerPong from './pages/BeerPong'
import Guests from './pages/Guests'
import Home from './pages/Home'

type ComingSoonProps = {
  title: string
}

function ComingSoon({
  title,
}: ComingSoonProps) {
  return (
    <main className="coming-soon">
      <Link
        to="/"
        className="back-link"
      >
        ← Retour
      </Link>

      <div>
        <p className="coming-soon__label">
          Anniv 2026
        </p>

        <h1>{title}</h1>

        <p>
          Ce module arrive bientôt.
        </p>
      </div>
    </main>
  )
}

function AdminRoute() {
  const {
    user,
    isAdmin,
    loading,
  } = useAuth()

  if (loading) {
    return (
      <main className="coming-soon">
        <div>
          <p className="coming-soon__label">
            Anniv 2026
          </p>

          <h1>Admin</h1>

          <p>
            Vérification de la session...
          </p>
        </div>
      </main>
    )
  }

  if (!user || !isAdmin) {
    return (
      <Navigate
        to="/admin/login"
        replace
      />
    )
  }

  return <Admin />
}

function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={<Home />}
      />

      <Route
        path="/iceberg"
        element={
          <ComingSoon title="Iceberg" />
        }
      />

      <Route
        path="/beer-pong"
        element={<BeerPong />}
      />

      <Route
        path="/guests"
        element={<Guests />}
      />

      <Route
        path="/admin/login"
        element={<AdminLogin />}
      />

      <Route
        path="/admin"
        element={<AdminRoute />}
      />
    </Routes>
  )
}

export default App