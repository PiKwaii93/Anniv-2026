import {
  lazy,
  Suspense,
  type ReactNode,
} from 'react'

import {
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'

import { useAuth } from './features/auth/AuthContext'

import Home from './pages/Home'

const Admin = lazy(
  () => import('./pages/Admin'),
)

const AdminDashboard = lazy(
  () => import('./pages/AdminDashboard'),
)

const AdminLogin = lazy(
  () => import('./pages/AdminLogin'),
)

const BeerPong = lazy(
  () => import('./pages/BeerPong'),
)

const Guests = lazy(
  () => import('./pages/Guests'),
)

const Iceberg = lazy(
  () => import('./pages/Iceberg'),
)

const IcebergAdmin = lazy(
  () => import('./pages/IcebergAdmin'),
)

type AdminRouteProps = {
  children: ReactNode
}

function RouteLoading() {
  return (
    <main className="coming-soon">
      <div>
        <p className="coming-soon__label">
          Anniv 2026
        </p>

        <h1>Chargement</h1>

        <p>
          Ouverture du module...
        </p>
      </div>
    </main>
  )
}

function AdminRoute({
  children,
}: AdminRouteProps) {
  const location = useLocation()

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
        state={{
          from: `${location.pathname}${location.search}${location.hash}`,
        }}
      />
    )
  }

  return children
}

function App() {
  return (
    <Suspense fallback={<RouteLoading />}>
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
              <AdminDashboard />
            </AdminRoute>
          }
        />

        <Route
          path="/admin/guests"
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
    </Suspense>
  )
}

export default App
