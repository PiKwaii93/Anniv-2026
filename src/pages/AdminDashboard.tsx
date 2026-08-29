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

type BingoPromptRow = {
  id: string
  is_active: boolean
}

type MissionPromptRow = {
  id: string
  is_active: boolean
}

type MissionScoreRow = {
  player_id: string
  completed_count: number
}

type RoomQuestionRow = {
  id: string
  is_active: boolean
}

type RoomPlayerRow = {
  player_key: string
  score: number
}

type RoomPublicState = {
  phase: 'idle' | 'open' | 'revealed'
  mode?: 'likely' | 'majority' | 'predict' | 'who_said'
  stage?: 'single' | 'nomination' | 'final'
  voteCount?: number
}

type RoomStateRow = {
  state: RoomPublicState | null
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
}

type PublicationStats = {
  total: number
  active: number
}

type MissionStats = PublicationStats & {
  players: number
  completed: number
}

type RoomStats = PublicationStats & {
  players: number
  totalScore: number
  state: RoomPublicState
}

const emptyStats: PublicationStats = {
  total: 0,
  active: 0,
}

const emptyMissionStats: MissionStats = {
  total: 0,
  active: 0,
  players: 0,
  completed: 0,
}

const emptyRoomStats: RoomStats = {
  total: 0,
  active: 0,
  players: 0,
  totalScore: 0,
  state: {
    phase: 'idle',
  },
}

const roomModeCopy: Record<
  NonNullable<RoomPublicState['mode']>,
  string
> = {
  likely: 'Plus susceptible de…',
  majority: 'Majority Rules',
  predict: 'Devine le groupe',
  who_said: 'Qui a répondu ça ?',
}

function AdminDashboard() {
  const { guests } = useGuests()

  const {
    user,
    signOut,
  } = useAuth()

  const [icebergStats, setIcebergStats] =
    useState<PublicationStats>(emptyStats)

  const [bingoStats, setBingoStats] =
    useState<PublicationStats>(emptyStats)

  const [missionStats, setMissionStats] =
    useState<MissionStats>(emptyMissionStats)

  const [roomStats, setRoomStats] =
    useState<RoomStats>(emptyRoomStats)

  const [beerPongState, setBeerPongState] =
    useState<BeerPongState>({})

  const [loading, setLoading] =
    useState(true)

  const [error, setError] =
    useState('')

  const guestStats = useMemo(
    () => ({
      confirmed: guests.filter(
        (guest) => guest.status === 'confirmed',
      ).length,
      invited: guests.filter(
        (guest) => guest.status === 'invited',
      ).length,
      maybe: guests.filter(
        (guest) => guest.status === 'maybe',
      ).length,
      declined: guests.filter(
        (guest) => guest.status === 'declined',
      ).length,
      plusOnes: guests.reduce(
        (total, guest) =>
          total + guest.plusOnes.length,
        0,
      ),
    }),
    [guests],
  )

  const loadDashboardData =
    useCallback(async () => {
      const [
        icebergResult,
        beerPongResult,
        bingoResult,
        missionPromptResult,
        missionScoreResult,
        roomQuestionResult,
        roomPlayerResult,
        roomStateResult,
      ] = await Promise.all([
        supabase
          .from('iceberg_entries')
          .select('id, is_published'),
        supabase
          .from('beer_pong_state')
          .select('state')
          .eq('id', 'main')
          .maybeSingle(),
        supabase
          .from('bingo_prompts')
          .select('id, is_active'),
        supabase
          .from('secret_mission_prompts')
          .select('id, is_active'),
        supabase
          .from('secret_mission_scoreboard')
          .select('player_id, completed_count'),
        supabase
          .from('live_vote_questions')
          .select('id, is_active'),
        supabase
          .from('live_vote_players')
          .select('player_key, score'),
        supabase
          .from('live_vote_public_state')
          .select('state')
          .eq('id', 'main')
          .maybeSingle(),
      ])

      let hasError = false

      if (icebergResult.error) {
        console.error(
          'Unable to load Iceberg dashboard stats:',
          icebergResult.error,
        )
        hasError = true
      } else {
        const rows =
          (icebergResult.data ?? []) as IcebergEntryRow[]

        setIcebergStats({
          total: rows.length,
          active: rows.filter(
            (entry) => entry.is_published,
          ).length,
        })
      }

      if (beerPongResult.error) {
        console.error(
          'Unable to load Beer Pong dashboard stats:',
          beerPongResult.error,
        )
        hasError = true
      } else if (beerPongResult.data) {
        const row =
          beerPongResult.data as BeerPongRow

        setBeerPongState(row.state ?? {})
      } else {
        setBeerPongState({})
      }

      if (bingoResult.error) {
        console.error(
          'Unable to load Bingo dashboard stats:',
          bingoResult.error,
        )
        hasError = true
      } else {
        const rows =
          (bingoResult.data ?? []) as BingoPromptRow[]

        setBingoStats({
          total: rows.length,
          active: rows.filter(
            (prompt) => prompt.is_active,
          ).length,
        })
      }

      if (
        missionPromptResult.error ||
        missionScoreResult.error
      ) {
        console.error(
          'Unable to load mission dashboard stats:',
          missionPromptResult.error,
          missionScoreResult.error,
        )
        hasError = true
      } else {
        const promptRows =
          (missionPromptResult.data ?? []) as MissionPromptRow[]
        const scoreRows =
          (missionScoreResult.data ?? []) as MissionScoreRow[]

        setMissionStats({
          total: promptRows.length,
          active: promptRows.filter(
            (prompt) => prompt.is_active,
          ).length,
          players: scoreRows.length,
          completed: scoreRows.reduce(
            (total, row) =>
              total + row.completed_count,
            0,
          ),
        })
      }

      if (
        roomQuestionResult.error ||
        roomPlayerResult.error ||
        roomStateResult.error
      ) {
        console.error(
          'Unable to load La Salle dashboard stats:',
          roomQuestionResult.error,
          roomPlayerResult.error,
          roomStateResult.error,
        )
        hasError = true
      } else {
        const questionRows =
          (roomQuestionResult.data ?? []) as RoomQuestionRow[]
        const playerRows =
          (roomPlayerResult.data ?? []) as RoomPlayerRow[]
        const stateRow =
          roomStateResult.data as RoomStateRow | null

        setRoomStats({
          total: questionRows.length,
          active: questionRows.filter(
            (question) => question.is_active,
          ).length,
          players: playerRows.length,
          totalScore: playerRows.reduce(
            (total, player) => total + player.score,
            0,
          ),
          state:
            stateRow?.state ?? {
              phase: 'idle',
            },
        })
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
      .channel('anniv-2026-admin-dashboard')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'iceberg_entries',
        },
        () => void loadDashboardData(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'beer_pong_state',
        },
        () => void loadDashboardData(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bingo_prompts',
        },
        () => void loadDashboardData(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'secret_mission_scoreboard',
        },
        () => void loadDashboardData(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_vote_public_state',
          filter: 'id=eq.main',
        },
        () => void loadDashboardData(),
      )
      .subscribe()

    const refreshInterval = window.setInterval(
      () => void loadDashboardData(),
      15000,
    )

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void loadDashboardData()
      }
    }

    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange,
    )

    return () => {
      window.clearInterval(refreshInterval)
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      )
      void supabase.removeChannel(channel)
    }
  }, [loadDashboardData])

  const selectedPlayerCount =
    beerPongState.selectedPlayerIds?.length ?? 0

  const teamCount =
    beerPongState.teams?.length ?? 0

  const roundCount =
    beerPongState.rounds?.length ?? 0

  const beerPongStatus = useMemo(() => {
    if (beerPongState.championTeamId) {
      return {
        label: 'Terminé',
        detail: 'Le tournoi a son champion.',
        tone: 'finished',
      }
    }

    if (beerPongState.draftValidated) {
      return {
        label: 'En cours',
        detail:
          `${teamCount} équipe${teamCount > 1 ? 's' : ''} · ${roundCount} tour${roundCount > 1 ? 's' : ''}`,
        tone: 'live',
      }
    }

    if (teamCount > 0) {
      return {
        label: 'Draft prête',
        detail:
          `${teamCount} équipe${teamCount > 1 ? 's' : ''} à valider`,
        tone: 'ready',
      }
    }

    if (selectedPlayerCount > 0) {
      return {
        label: 'Préparation',
        detail:
          `${selectedPlayerCount} joueur${selectedPlayerCount > 1 ? 's' : ''} sélectionné${selectedPlayerCount > 1 ? 's' : ''}`,
        tone: 'ready',
      }
    }

    return {
      label: 'Non démarré',
      detail: 'Aucun joueur sélectionné.',
      tone: 'idle',
    }
  }, [
    beerPongState,
    roundCount,
    selectedPlayerCount,
    teamCount,
  ])

  const roomStatus = useMemo(() => {
    if (roomStats.state.phase === 'open') {
      return {
        label: 'Vote ouvert',
        detail:
          `${roomStats.state.voteCount ?? 0} vote${(roomStats.state.voteCount ?? 0) !== 1 ? 's' : ''} reçu${(roomStats.state.voteCount ?? 0) !== 1 ? 's' : ''}`,
      }
    }

    if (roomStats.state.phase === 'revealed') {
      return {
        label: 'Résultats révélés',
        detail:
          roomStats.state.mode
            ? roomModeCopy[roomStats.state.mode]
            : 'Round terminé',
      }
    }

    return {
      label: 'En attente',
      detail: 'Aucun vote live en cours.',
    }
  }, [roomStats.state])

  return (
    <main className="control-room">
      <div className="control-room__glow control-room__glow--one" />
      <div className="control-room__glow control-room__glow--two" />

      <header className="control-header">
        <div className="control-header__navigation">
          <Link to="/" className="back-link">
            ← Site public
          </Link>

          <button
            type="button"
            className="control-signout"
            onClick={() => {
              void signOut()
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
              <strong>Admin connecté</strong>
              <span>
                {loading
                  ? 'Synchronisation...'
                  : 'Données chargées'}
              </span>
            </div>
          </div>
        </div>

        <p className="control-header__description">
          Invités, Iceberg, Beer Pong, Bingo, Missions secrètes et La Salle sont regroupés ici pour piloter la soirée.
        </p>

        {user?.email && (
          <p className="control-header__account">
            Connecté avec <span>{user.email}</span>
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
            <span className="control-module__index">01</span>
            <span className="control-module__arrow">↗</span>
          </div>
          <div className="control-module__body">
            <p className="control-module__label">Organisation</p>
            <h2>Invités</h2>
            <div className="control-module__metric">
              <strong>{guests.length}</strong>
              <span>personne{guests.length !== 1 ? 's' : ''}</span>
            </div>
            <p className="control-module__summary">
              {guestStats.confirmed} confirmé{guestStats.confirmed !== 1 ? 's' : ''}
              <span>·</span>
              {guestStats.plusOnes} +1
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
            <span className="control-module__index">02</span>
            <span className="control-module__arrow">↗</span>
          </div>
          <div className="control-module__body">
            <p className="control-module__label">Archives</p>
            <h2>Iceberg</h2>
            <div className="control-module__metric">
              <strong>{loading ? '—' : icebergStats.total}</strong>
              <span>dossier{icebergStats.total !== 1 ? 's' : ''}</span>
            </div>
            <p className="control-module__summary">
              {loading
                ? 'Synchronisation...'
                : `${icebergStats.active} publié${icebergStats.active !== 1 ? 's' : ''}`}
              {!loading && (
                <>
                  <span>·</span>
                  {icebergStats.total - icebergStats.active} masqué{icebergStats.total - icebergStats.active !== 1 ? 's' : ''}
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
            <span className="control-module__index">03</span>
            <span className="control-module__arrow">↗</span>
          </div>
          <div className="control-module__body">
            <p className="control-module__label">Tournoi</p>
            <h2>Beer Pong</h2>
            <div className="control-module__metric control-module__metric--status">
              <strong>{beerPongStatus.label}</strong>
            </div>
            <p className="control-module__summary">
              {beerPongStatus.detail}
            </p>
          </div>
          <div className="control-module__footer">
            Ouvrir le tournoi
          </div>
        </Link>

        <Link
          to="/admin/bingo"
          className="control-module control-module--bingo"
        >
          <div className="control-module__top">
            <span className="control-module__index">04</span>
            <span className="control-module__arrow">↗</span>
          </div>
          <div className="control-module__body">
            <p className="control-module__label">Jeu personnel</p>
            <h2>Bingo</h2>
            <div className="control-module__metric">
              <strong>{loading ? '—' : bingoStats.active}</strong>
              <span>cases actives</span>
            </div>
            <p className="control-module__summary">
              {loading
                ? 'Synchronisation...'
                : `${bingoStats.total} au total`}
            </p>
          </div>
          <div className="control-module__footer">
            Gérer le pool du Bingo
          </div>
        </Link>

        <Link
          to="/admin/missions"
          className="control-module control-module--missions"
        >
          <div className="control-module__top">
            <span className="control-module__index">05</span>
            <span className="control-module__arrow">↗</span>
          </div>
          <div className="control-module__body">
            <p className="control-module__label">Infiltration</p>
            <h2>Missions</h2>
            <div className="control-module__metric">
              <strong>{loading ? '—' : missionStats.active}</strong>
              <span>missions actives</span>
            </div>
            <p className="control-module__summary">
              {loading
                ? 'Synchronisation...'
                : `${missionStats.players} agent${missionStats.players !== 1 ? 's' : ''} · ${missionStats.completed} réussite${missionStats.completed !== 1 ? 's' : ''}`}
            </p>
          </div>
          <div className="control-module__footer">
            Gérer les Missions secrètes
          </div>
        </Link>

        <Link
          to="/admin/room"
          className="control-module control-module--room"
        >
          <div className="control-module__top">
            <span className="control-module__index">06</span>
            <span className="control-module__arrow">↗</span>
          </div>
          <div className="control-module__body">
            <p className="control-module__label">Vote collectif</p>
            <h2>La Salle</h2>
            <div className="control-module__metric control-module__metric--status">
              <strong>{loading ? '—' : roomStatus.label}</strong>
            </div>
            <p className="control-module__summary">
              {loading
                ? 'Synchronisation...'
                : `${roomStats.active} question${roomStats.active !== 1 ? 's' : ''} active${roomStats.active !== 1 ? 's' : ''} · ${roomStats.players} joueur${roomStats.players !== 1 ? 's' : ''}`}
            </p>
          </div>
          <div className="control-module__footer">
            Ouvrir la régie live
          </div>
        </Link>
      </section>

      <section className="control-overview">
        <div className="control-section-heading">
          <div>
            <p className="control-eyebrow">Vue d&apos;ensemble</p>
            <h2>État de la soirée</h2>
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
              <strong>{guests.length}</strong>
            </div>
            <div className="control-stat-list">
              <div><span>Confirmés</span><strong>{guestStats.confirmed}</strong></div>
              <div><span>En attente</span><strong>{guestStats.invited}</strong></div>
              <div><span>Peut-être</span><strong>{guestStats.maybe}</strong></div>
              <div><span>Refusés</span><strong>{guestStats.declined}</strong></div>
              <div><span>+1</span><strong>{guestStats.plusOnes}</strong></div>
            </div>
          </article>

          <article className="control-overview-card">
            <div className="control-overview-card__heading">
              <span>Iceberg</span>
              <strong>{loading ? '—' : icebergStats.total}</strong>
            </div>
            <div className="control-progress">
              <div className="control-progress__labels">
                <span>Publication</span>
                <strong>
                  {loading
                    ? '—'
                    : `${icebergStats.active}/${icebergStats.total}`}
                </strong>
              </div>
              <div className="control-progress__track">
                <div
                  className="control-progress__value"
                  style={{
                    width:
                      icebergStats.total > 0
                        ? `${(icebergStats.active / icebergStats.total) * 100}%`
                        : '0%',
                  }}
                />
              </div>
            </div>
            <p className="control-overview-card__note">
              {icebergStats.total === 0
                ? 'Aucun dossier créé.'
                : `${icebergStats.active} dossier${icebergStats.active !== 1 ? 's' : ''} visible${icebergStats.active !== 1 ? 's' : ''}.`}
            </p>
          </article>

          <article className="control-overview-card">
            <div className="control-overview-card__heading">
              <span>Beer Pong</span>
              <span
                className={`control-tournament-status control-tournament-status--${beerPongStatus.tone}`}
              >
                {beerPongStatus.label}
              </span>
            </div>
            <div className="control-stat-list">
              <div><span>Joueurs</span><strong>{selectedPlayerCount}</strong></div>
              <div><span>Équipes</span><strong>{teamCount}</strong></div>
              <div><span>Tours créés</span><strong>{roundCount}</strong></div>
            </div>
            <p className="control-overview-card__note">
              {beerPongStatus.detail}
            </p>
          </article>

          <article className="control-overview-card">
            <div className="control-overview-card__heading">
              <span>Bingo</span>
              <strong>{loading ? '—' : bingoStats.active}</strong>
            </div>
            <div className="control-stat-list">
              <div><span>Cases actives</span><strong>{bingoStats.active}</strong></div>
              <div><span>Masquées</span><strong>{bingoStats.total - bingoStats.active}</strong></div>
              <div><span>Minimum requis</span><strong>16</strong></div>
            </div>
            <p className="control-overview-card__note">
              {bingoStats.active >= 16
                ? 'Le pool est prêt à générer des grilles.'
                : 'Pas assez de cases actives pour générer une grille.'}
            </p>
          </article>

          <article className="control-overview-card">
            <div className="control-overview-card__heading">
              <span>Missions</span>
              <strong>{loading ? '—' : missionStats.players}</strong>
            </div>
            <div className="control-stat-list">
              <div><span>Pool actif</span><strong>{missionStats.active}</strong></div>
              <div><span>Agents</span><strong>{missionStats.players}</strong></div>
              <div><span>Réussites</span><strong>{missionStats.completed}</strong></div>
            </div>
            <p className="control-overview-card__note">
              {missionStats.players === 0
                ? 'Aucune identité liée pour le moment.'
                : `${missionStats.completed} mission${missionStats.completed !== 1 ? 's' : ''} validée${missionStats.completed !== 1 ? 's' : ''} par les agents.`}
            </p>
          </article>

          <article className="control-overview-card">
            <div className="control-overview-card__heading">
              <span>La Salle</span>
              <strong>{loading ? '—' : roomStats.players}</strong>
            </div>
            <div className="control-stat-list">
              <div><span>Questions actives</span><strong>{roomStats.active}</strong></div>
              <div><span>Joueurs liés</span><strong>{roomStats.players}</strong></div>
              <div><span>Votes round</span><strong>{roomStats.state.voteCount ?? 0}</strong></div>
              <div><span>Points distribués</span><strong>{roomStats.totalScore}</strong></div>
            </div>
            <p className="control-overview-card__note">
              {roomStatus.detail}
            </p>
          </article>
        </div>
      </section>

      <section className="control-shortcuts">
        <div className="control-section-heading">
          <div>
            <p className="control-eyebrow">Raccourcis</p>
            <h2>Accès rapide</h2>
          </div>
        </div>

        <div className="control-shortcuts__grid">
          <Link to="/guests" className="control-shortcut">
            <span>Liste publique</span>
            <strong>Voir les invités</strong>
            <span>↗</span>
          </Link>

          <Link to="/iceberg" className="control-shortcut">
            <span>Aperçu public</span>
            <strong>Voir l&apos;Iceberg</strong>
            <span>↗</span>
          </Link>

          <Link to="/beer-pong" className="control-shortcut">
            <span>Mode soirée</span>
            <strong>Beer Pong</strong>
            <span>↗</span>
          </Link>

          <Link to="/bingo" className="control-shortcut">
            <span>Jeu public</span>
            <strong>Voir le Bingo</strong>
            <span>↗</span>
          </Link>

          <Link to="/missions" className="control-shortcut">
            <span>Infiltration</span>
            <strong>Missions secrètes</strong>
            <span>↗</span>
          </Link>

          <Link to="/admin/room" className="control-shortcut">
            <span>Régie live</span>
            <strong>Gérer La Salle</strong>
            <span>↗</span>
          </Link>

          <Link to="/room" className="control-shortcut">
            <span>Vue publique</span>
            <strong>Voir La Salle</strong>
            <span>↗</span>
          </Link>
        </div>
      </section>
    </main>
  )
}

export default AdminDashboard
