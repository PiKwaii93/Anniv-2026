import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../features/auth/AuthContext'
import { useGuests } from '../features/guests/GuestsContext'
import { supabase } from '../lib/supabase'

import './AdminDashboard.css'

type IcebergEntryRow = {
  id: string
  is_published: boolean
}

type BeerPongState = {
  selectedPlayerIds?: string[]
  teams?: unknown[]
  draftValidated?: boolean
  rounds?: unknown[][]
  championTeamId?: string | null
}

type BeerPongRow = {
  state: BeerPongState | null
  updated_at: string
}

type IcebergStats = {
  total: number
  published: number
}

const emptyIcebergStats: IcebergStats = {
  total: 0,
  published: 0,
}

function AdminDashboard() {
  const { guests } = useGuests()

  const {
    user,
    signOut,
  } = useAuth()

  const [
    icebergStats,
    setIcebergStats,
  ] = useState<IcebergStats>(
    emptyIcebergStats,
  )

  const [
    beerPongState,
    setBeerPongState,
  ] = useState<BeerPongState>(
    {},
  )

  const [loading, setLoading] =
    useState(true)

  const [error, setError] =
    useState('')

  const confirmedCount =
    useMemo(
      () =>
        guests.filter(
          (guest) =>
            guest.status ===
            'confirmed',
        ).length,
      [guests],
    )

  const maybeCount =
    useMemo(
      () =>
        guests.filter(
          (guest) =>
            guest.status ===
            'maybe',
        ).length,
      [guests],
    )

  const invitedCount =
    useMemo(
      () =>
        guests.filter(
          (guest) =>
            guest.status ===
            'invited',
        ).length,
      [guests],
    )

  const declinedCount =
    useMemo(
      () =>
        guests.filter(
          (guest) =>
            guest.status ===
            'declined',
        ).length,
      [guests],
    )

  const plusOneCount =
    useMemo(
      () =>
        guests.reduce(
          (
            total,
            guest,
          ) =>
            total +
            guest.plusOnes.length,
          0,
        ),
      [guests],
    )

  const loadDashboardData =
    useCallback(async () => {
      const [
        icebergResult,
        beerPongResult,
      ] = await Promise.all([
        supabase
          .from(
            'iceberg_entries',
          )
          .select(
            'id, is_published',
          ),

        supabase
          .from(
            'beer_pong_state',
          )
          .select(
            'state, updated_at',
          )
          .eq('id', 'main')
          .maybeSingle(),
      ])

      let hasError = false

      if (
        icebergResult.error
      ) {
        console.error(
          'Unable to load iceberg dashboard stats:',
          icebergResult.error,
        )

        hasError = true
      } else {
        const rows =
          (icebergResult.data ??
            []) as IcebergEntryRow[]

        setIcebergStats({
          total: rows.length,

          published:
            rows.filter(
              (entry) =>
                entry.is_published,
            ).length,
        })
      }

      if (
        beerPongResult.error
      ) {
        console.error(
          'Unable to load Beer Pong dashboard stats:',
          beerPongResult.error,
        )

        hasError = true
      } else if (
        beerPongResult.data
      ) {
        const row =
          beerPongResult.data as BeerPongRow

        setBeerPongState(
          row.state ?? {},
        )
      } else {
        setBeerPongState({})
      }

      setError(
        hasError
          ? 'Certaines données du dashboard n’ont pas pu être synchronisées.'
          : '',
      )

      setLoading(false)
    }, [])

  useEffect(() => {
    void loadDashboardData()
  }, [loadDashboardData])

  useEffect(() => {
    const channel = supabase
      .channel(
        'anniv-2026-admin-dashboard',
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table:
            'iceberg_entries',
        },
        () => {
          void loadDashboardData()
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table:
            'beer_pong_state',
        },
        () => {
          void loadDashboardData()
        },
      )
      .subscribe()

    const refreshInterval =
      window.setInterval(
        () => {
          void loadDashboardData()
        },
        15000,
      )

    const handleVisibilityChange =
      () => {
        if (
          document.visibilityState ===
          'visible'
        ) {
          void loadDashboardData()
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
  }, [loadDashboardData])

  const selectedPlayerCount =
    beerPongState
      .selectedPlayerIds
      ?.length ?? 0

  const teamCount =
    beerPongState.teams
      ?.length ?? 0

  const roundCount =
    beerPongState.rounds
      ?.length ?? 0

  const beerPongStatus =
    useMemo(() => {
      if (
        beerPongState
          .championTeamId
      ) {
        return {
          label: 'Terminé',
          detail:
            'Le tournoi a son champion.',
          tone: 'finished',
        }
      }

      if (
        beerPongState
          .draftValidated
      ) {
        return {
          label: 'En cours',
          detail:
            `${teamCount} équipe${
              teamCount > 1
                ? 's'
                : ''
            } · ${roundCount} tour${
              roundCount > 1
                ? 's'
                : ''
            }`,
          tone: 'live',
        }
      }

      if (
        teamCount > 0
      ) {
        return {
          label: 'Draft prête',
          detail:
            `${teamCount} équipe${
              teamCount > 1
                ? 's'
                : ''
            } à valider`,
          tone: 'ready',
        }
      }

      if (
        selectedPlayerCount > 0
      ) {
        return {
          label: 'Préparation',
          detail:
            `${selectedPlayerCount} joueur${
              selectedPlayerCount >
              1
                ? 's'
                : ''
            } sélectionné${
              selectedPlayerCount >
              1
                ? 's'
                : ''
            }`,
          tone: 'ready',
        }
      }

      return {
        label: 'Non démarré',
        detail:
          'Aucun joueur sélectionné.',
        tone: 'idle',
      }
    }, [
      beerPongState,
      roundCount,
      selectedPlayerCount,
      teamCount,
    ])

  const handleSignOut =
    async () => {
      await signOut()
    }

  return (
    <main className="control-room">
      <div className="control-room__glow control-room__glow--one" />
      <div className="control-room__glow control-room__glow--two" />

      <header className="control-header">
        <div className="control-header__navigation">
          <Link
            to="/"
            className="back-link"
          >
            ← Site public
          </Link>

          <button
            type="button"
            className="control-signout"
            onClick={() => {
              void handleSignOut()
            }}
          >
            Déconnexion
          </button>
        </div>

        <div className="control-header__top">
          <div>
            <p className="control-eyebrow">
              Anniv 2026 / privé
            </p>

            <h1>
              Control
              <span>Room</span>
            </h1>
          </div>

          <div className="control-status">
            <span className="control-status__dot" />

            <div>
              <strong>
                Système actif
              </strong>

              <span>
                Supabase connecté
              </span>
            </div>
          </div>
        </div>

        <p className="control-header__description">
          Le centre de contrôle de la
          soirée. Invités, Iceberg et
          tournoi sont regroupés ici.
        </p>

        {user?.email && (
          <p className="control-header__account">
            Connecté avec{' '}
            <span>
              {user.email}
            </span>
          </p>
        )}
      </header>

      {error && (
        <div className="control-error">
          {error}
        </div>
      )}

      <section className="control-modules">
        <Link
          to="/admin/guests"
          className="control-module control-module--guests"
        >
          <div className="control-module__top">
            <span className="control-module__index">
              01
            </span>

            <span className="control-module__arrow">
              ↗
            </span>
          </div>

          <div className="control-module__body">
            <p className="control-module__label">
              Organisation
            </p>

            <h2>
              Invités
            </h2>

            <div className="control-module__metric">
              <strong>
                {guests.length}
              </strong>

              <span>
                personne
                {guests.length !== 1
                  ? 's'
                  : ''}
              </span>
            </div>

            <p className="control-module__summary">
              {confirmedCount}{' '}
              confirmé
              {confirmedCount !== 1
                ? 's'
                : ''}

              <span>·</span>

              {plusOneCount}{' '}
              +1
            </p>
          </div>

          <div className="control-module__footer">
            Gérer les invités
          </div>
        </Link>

        <Link
          to="/admin/iceberg"
          className="control-module control-module--iceberg"
        >
          <div className="control-module__top">
            <span className="control-module__index">
              02
            </span>

            <span className="control-module__arrow">
              ↗
            </span>
          </div>

          <div className="control-module__body">
            <p className="control-module__label">
              Archives
            </p>

            <h2>
              Iceberg
            </h2>

            <div className="control-module__metric">
              <strong>
                {loading
                  ? '—'
                  : icebergStats.total}
              </strong>

              <span>
                dossier
                {icebergStats.total !==
                1
                  ? 's'
                  : ''}
              </span>
            </div>

            <p className="control-module__summary">
              {loading
                ? 'Synchronisation...'
                : `${icebergStats.published} publié${
                    icebergStats.published !==
                    1
                      ? 's'
                      : ''
                  }`}

              {!loading && (
                <>
                  <span>·</span>

                  {icebergStats.total -
                    icebergStats.published}{' '}
                  masqué
                  {icebergStats.total -
                    icebergStats.published !==
                  1
                    ? 's'
                    : ''}
                </>
              )}
            </p>
          </div>

          <div className="control-module__footer">
            Gérer l&apos;Iceberg
          </div>
        </Link>

        <Link
          to="/beer-pong"
          className="control-module control-module--beer"
        >
          <div className="control-module__top">
            <span className="control-module__index">
              03
            </span>

            <span className="control-module__arrow">
              ↗
            </span>
          </div>

          <div className="control-module__body">
            <p className="control-module__label">
              Tournoi
            </p>

            <h2>
              Beer Pong
            </h2>

            <div className="control-module__metric control-module__metric--status">
              <strong>
                {
                  beerPongStatus.label
                }
              </strong>
            </div>

            <p className="control-module__summary">
              {
                beerPongStatus.detail
              }
            </p>
          </div>

          <div className="control-module__footer">
            Ouvrir le tournoi
          </div>
        </Link>
      </section>

      <section className="control-overview">
        <div className="control-section-heading">
          <div>
            <p className="control-eyebrow">
              Vue d&apos;ensemble
            </p>

            <h2>
              État de la soirée
            </h2>
          </div>

          <span className="control-live">
            <span />
            Live
          </span>
        </div>

        <div className="control-overview__grid">
          <article className="control-overview-card">
            <div className="control-overview-card__heading">
              <span>Invités</span>

              <strong>
                {guests.length}
              </strong>
            </div>

            <div className="control-stat-list">
              <div>
                <span>
                  Confirmés
                </span>

                <strong>
                  {confirmedCount}
                </strong>
              </div>

              <div>
                <span>
                  Invités
                </span>

                <strong>
                  {invitedCount}
                </strong>
              </div>

              <div>
                <span>
                  Peut-être
                </span>

                <strong>
                  {maybeCount}
                </strong>
              </div>

              <div>
                <span>
                  Refusés
                </span>

                <strong>
                  {declinedCount}
                </strong>
              </div>

              <div>
                <span>
                  +1
                </span>

                <strong>
                  {plusOneCount}
                </strong>
              </div>
            </div>
          </article>

          <article className="control-overview-card">
            <div className="control-overview-card__heading">
              <span>
                Iceberg
              </span>

              <strong>
                {loading
                  ? '—'
                  : icebergStats.total}
              </strong>
            </div>

            <div className="control-progress">
              <div className="control-progress__labels">
                <span>
                  Publication
                </span>

                <strong>
                  {loading
                    ? '—'
                    : `${icebergStats.published}/${icebergStats.total}`}
                </strong>
              </div>

              <div className="control-progress__track">
                <div
                  className="control-progress__value"
                  style={{
                    width:
                      icebergStats.total >
                      0
                        ? `${
                            (
                              icebergStats.published /
                              icebergStats.total
                            ) *
                            100
                          }%`
                        : '0%',
                  }}
                />
              </div>
            </div>

            <p className="control-overview-card__note">
              {icebergStats.total === 0
                ? 'Aucun dossier créé.'
                : icebergStats.published ===
                    icebergStats.total
                  ? 'Tout est visible publiquement.'
                  : `${
                      icebergStats.total -
                      icebergStats.published
                    } dossier${
                      icebergStats.total -
                        icebergStats.published >
                      1
                        ? 's'
                        : ''
                    } encore masqué${
                      icebergStats.total -
                        icebergStats.published >
                      1
                        ? 's'
                        : ''
                    }.`}
            </p>
          </article>

          <article className="control-overview-card">
            <div className="control-overview-card__heading">
              <span>
                Beer Pong
              </span>

              <span
                className={`control-tournament-status control-tournament-status--${beerPongStatus.tone}`}
              >
                {
                  beerPongStatus.label
                }
              </span>
            </div>

            <div className="control-stat-list">
              <div>
                <span>
                  Joueurs
                </span>

                <strong>
                  {
                    selectedPlayerCount
                  }
                </strong>
              </div>

              <div>
                <span>
                  Équipes
                </span>

                <strong>
                  {teamCount}
                </strong>
              </div>

              <div>
                <span>
                  Tours créés
                </span>

                <strong>
                  {roundCount}
                </strong>
              </div>
            </div>

            <p className="control-overview-card__note">
              {
                beerPongStatus.detail
              }
            </p>
          </article>
        </div>
      </section>

      <section className="control-shortcuts">
        <div className="control-section-heading">
          <div>
            <p className="control-eyebrow">
              Raccourcis
            </p>

            <h2>
              Accès rapide
            </h2>
          </div>
        </div>

        <div className="control-shortcuts__grid">
          <Link
            to="/guests"
            className="control-shortcut"
          >
            <span>
              Liste publique
            </span>

            <strong>
              Voir les invités
            </strong>

            <span>↗</span>
          </Link>

          <Link
            to="/iceberg"
            className="control-shortcut"
          >
            <span>
              Aperçu public
            </span>

            <strong>
              Voir l&apos;Iceberg
            </strong>

            <span>↗</span>
          </Link>

          <Link
            to="/beer-pong"
            className="control-shortcut"
          >
            <span>
              Mode soirée
            </span>

            <strong>
              Beer Pong
            </strong>

            <span>↗</span>
          </Link>
        </div>
      </section>
    </main>
  )
}

export default AdminDashboard