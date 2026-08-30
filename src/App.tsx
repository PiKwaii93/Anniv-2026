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

import LiveAnnouncementOverlay from './features/announcements/LiveAnnouncementOverlay'
import { useAuth } from './features/auth/AuthContext'
import {
  PartyIdentityBadge,
  PartyIdentityGate,
} from './features/identity/PartyIdentityUI'
import AdminPartyDock from './features/party/AdminPartyDock'
import {
  isPartyModuleVisible,
  type PartyModule,
  useParty,
} from './features/party/PartyContext'

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

const Bingo = lazy(
  () => import('./pages/Bingo'),
)

const BingoAdmin = lazy(
  () => import('./pages/BingoAdmin'),
)

const ContentManager = lazy(
  () => import('./pages/ContentManager'),
)

const DirectorMode = lazy(
  () => import('./pages/DirectorModePolished'),
)

const Guests = lazy(
  () => import('./pages/Guests'),
)

const HallOfFame = lazy(
  () => import('./pages/HallOfFame'),
)

const Iceberg = lazy(
  () => import('./pages/Iceberg'),
)

const IcebergAdmin = lazy(
  () => import('./pages/IcebergAdmin'),
)

const LiveVoteRoom = lazy(
  () => import('./pages/LiveVoteRoom'),
)

const LiveVoteRoomAdmin = lazy(
  () => import('./pages/LiveVoteRoomAdmin'),
)

const PartyQr = lazy(
  () => import('./pages/PartyQr'),
)

const PartyScreen = lazy(
  () => import('./pages/PartyScreen'),
)

const SecretMissions = lazy(
  () => import('./pages/SecretMissions'),
)

const SecretMissionsAdmin = lazy(
  () => import('./pages/SecretMissionsAdmin'),
)

type AdminRouteProps = {
  children: ReactNode
}

type ModuleGateProps = {
  module: PartyModule
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

function ModuleGate({
  module,
  children,
}: ModuleGateProps) {
  const { isAdmin } = useAuth()

  const {
    settings,
    loading,
  } = useParty()

  if (loading) {
    return <RouteLoading />
  }

  if (
    isAdmin ||
    isPartyModuleVisible(
      settings,
      module,
    )
  ) {
    return children
  }

  const message =
    settings.phase === 'ended'
      ? 'Ce module est fermé pour cette édition.'
      : 'Ce module n’est pas encore ouvert au public.'

  return (
    <main className="coming-soon">
      <a
        href="/"
        className="back-link"
      >
        ← Accueil
      </a>

      <div>
        <p className="coming-soon__label">
          Anniv 2026
        </p>

        <h1>Patience</h1>

        <p>{message}</p>
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
    <>
      <AdminPartyDock />
      <LiveAnnouncementOverlay />
      <PartyIdentityBadge />

      <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route
            path="/"
            element={<Home />}
          />

          <Route
            path="/screen"
            element={<PartyScreen />}
          />

          <Route
            path="/hall-of-fame"
            element={<HallOfFame />}
          />

          <Route
            path="/iceberg"
            element={
              <ModuleGate module="iceberg">
                <Iceberg />
              </ModuleGate>
            }
          />

          <Route
            path="/beer-pong"
            element={
              <ModuleGate module="beer-pong">
                <BeerPong />
              </ModuleGate>
            }
          />

          <Route
            path="/bingo"
            element={
              <ModuleGate module="bingo">
                <Bingo />
              </ModuleGate>
            }
          />

          <Route
            path="/missions"
            element={
              <ModuleGate module="missions">
                <PartyIdentityGate>
                  <SecretMissions />
                </PartyIdentityGate>
              </ModuleGate>
            }
          />

          <Route
            path="/room"
            element={
              <ModuleGate module="room">
                <PartyIdentityGate>
                  <LiveVoteRoom />
                </PartyIdentityGate>
              </ModuleGate>
            }
          />

          <Route
            path="/guests"
            element={
              <ModuleGate module="guests">
                <Guests />
              </ModuleGate>
            }
          />

          <Route
            path="/qr"
            element={<PartyQr />}
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
            path="/admin/live"
            element={
              <AdminRoute>
                <DirectorMode />
              </AdminRoute>
            }
          />

          <Route
            path="/admin/content"
            element={
              <AdminRoute>
                <ContentManager />
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
            path="/admin/bingo"
            element={
              <AdminRoute>
                <BingoAdmin />
              </AdminRoute>
            }
          />

          <Route
            path="/admin/missions"
            element={
              <AdminRoute>
                <SecretMissionsAdmin />
              </AdminRoute>
            }
          />

          <Route
            path="/admin/room"
            element={
              <AdminRoute>
                <LiveVoteRoomAdmin />
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
    </>
  )
}

export default App
