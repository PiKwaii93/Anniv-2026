import type {
  ReactNode,
} from 'react'

import {
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
import Iceberg from './pages/Iceberg'
import IcebergAdmin from './pages/IcebergAdmin'

type AdminRouteProps = {
  children: ReactNode
}

function AdminRoute({
  children,
}: AdminRouteProps) {
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
            Vérification de la
            session...
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

  return children
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
        element={<Iceberg />}
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
        element={
          <AdminRoute>
            <Admin />
          </AdminRoute>
        }
      />

      <Route
        path="/admin/iceberg"
        element={
          <AdminRoute>
            <IcebergAdmin />
          </AdminRoute>
        }
      />

      <Route
        path="*"
        element={
          <Navigate
            to="/"
            replace
          />
        }
      />
    </Routes>
  )
}

export default App