import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { Link } from 'react-router-dom'
import { rememberMission } from '../features/guest/activityMemory'

import { useAuth } from '../features/auth/AuthContext'
import { useGuests } from '../features/guests/GuestsContext'
import { supabase } from '../lib/supabase'

import './SecretMissions.css'

type MissionDifficulty =
  | 'easy'
  | 'medium'
  | 'hard'

type Mission = {
  id: string
  text: string
  difficulty: MissionDifficulty
  assignedAt: string | null
}

type MissionState = {
  ok: boolean
  code?: string
  playerKey?: string
  playerName?: string
  completedCount?: number
  skipsRemaining?: number
  mission?: Mission | null
  justCompleted?: boolean
  completedText?: string
  justSkipped?: boolean
}

type StoredIdentity = {
  playerKey: string
  sessionToken: string
}

type AvailablePlayer = {
  key: string
  name: string
  detail: string
}

type ScoreRow = {
  player_id: string
  player_name: string
  completed_count: number
}

const STORAGE_KEY =
  'anniv-2026-secret-mission-identity-v1'

const difficultyCopy: Record<
  MissionDifficulty,
  string
> = {
  easy: 'Discrète',
  medium: 'Intermédiaire',
  hard: 'Corsée',
}

function parseStoredIdentity(
  value: string | null,
): StoredIdentity | null {
  if (!value) {
    return null
  }

  try {
    const parsed = JSON.parse(value) as Partial<StoredIdentity>

    if (
      typeof parsed.playerKey === 'string' &&
      typeof parsed.sessionToken === 'string'
    ) {
      return {
        playerKey: parsed.playerKey,
        sessionToken: parsed.sessionToken,
      }
    }
  } catch {
    return null
  }

  return null
}

function missionErrorMessage(
  code?: string,
) {
  switch (code) {
    case 'IDENTITY_ALREADY_CLAIMED':
      return 'Cette identité est déjà liée à un autre téléphone. Demande à l’admin de la réinitialiser si nécessaire.'
    case 'PLAYER_NOT_AVAILABLE':
      return 'Cette personne n’est plus disponible dans la liste des participants confirmés.'
    case 'INVALID_SESSION':
      return 'Cette session de mission n’est plus valide. Demande à l’admin de réinitialiser ton identité.'
    case 'NO_SKIP_LEFT':
      return 'Ton joker a déjà été utilisé.'
    case 'STALE_MISSION':
      return 'Ta mission a changé entre-temps. Elle vient d’être resynchronisée.'
    case 'MISSION_NOT_FOUND':
      return 'Cette mission n’existe plus. Une nouvelle mission va être attribuée.'
    default:
      return 'Impossible de synchroniser ta mission pour le moment.'
  }
}

function SecretMissions() {
  const { isAdmin } = useAuth()

  const {
    guests,
    loading: guestsLoading,
  } = useGuests()

  const [identity, setIdentity] =
    useState<StoredIdentity | null>(null)

  const [missionState, setMissionState] =
    useState<MissionState | null>(null)

  const [selectedPlayerKey, setSelectedPlayerKey] =
    useState('')

  const [restoring, setRestoring] =
    useState(true)

  const [busy, setBusy] =
    useState(false)

  const [revealed, setRevealed] =
    useState(false)

  const [message, setMessage] =
    useState('')

  const [error, setError] =
    useState('')

  const [scores, setScores] =
    useState<ScoreRow[]>([])

  const [scoresLoading, setScoresLoading] =
    useState(true)

  const availablePlayers = useMemo<AvailablePlayer[]>(
    () => {
      const players: AvailablePlayer[] = []

      guests
        .filter(
          (guest) =>
            guest.status === 'confirmed',
        )
        .forEach((guest) => {
          players.push({
            key: `guest:${guest.id}`,
            name: guest.name,
            detail: 'Invité',
          })

          guest.plusOnes.forEach((plusOne) => {
            players.push({
              key: `plus:${plusOne.id}`,
              name: plusOne.name,
              detail: `+1 de ${guest.name}`,
            })
          })
        })

      return players.sort((left, right) =>
        left.name.localeCompare(
          right.name,
          'fr',
          {
            sensitivity: 'base',
          },
        ),
      )
    },
    [guests],
  )

  const loadScores = useCallback(async () => {
    const { data, error: scoreError } =
      await supabase
        .from('secret_mission_scoreboard')
        .select(
          'player_id, player_name, completed_count',
        )
        .order('completed_count', {
          ascending: false,
        })
        .order('player_name', {
          ascending: true,
        })

    if (scoreError) {
      console.error(
        'Unable to load mission scoreboard:',
        scoreError,
      )
      setScoresLoading(false)
      return
    }

    setScores(
      (data ?? []) as ScoreRow[],
    )
    setScoresLoading(false)
  }, [])

  const synchronizeState = useCallback(
    async (
      storedIdentity: StoredIdentity,
      quiet = false,
    ) => {
      const { data, error: rpcError } =
        await supabase.rpc(
          'get_secret_mission_state',
          {
            p_player_key:
              storedIdentity.playerKey,
            p_session_token:
              storedIdentity.sessionToken,
          },
        )

      if (rpcError) {
        console.error(
          'Unable to synchronize secret mission:',
          rpcError,
        )

        if (!quiet) {
          setError(
            'Impossible de synchroniser ta mission.',
          )
        }

        return false
      }

      const nextState =
        data as MissionState

      if (!nextState.ok) {
        setError(
          missionErrorMessage(
            nextState.code,
          ),
        )

        if (
          nextState.code === 'INVALID_SESSION' ||
          nextState.code === 'PLAYER_NOT_AVAILABLE'
        ) {
          window.localStorage.removeItem(
            STORAGE_KEY,
          )
          setIdentity(null)
          setMissionState(null)
        }

        return false
      }

      setMissionState(nextState)
      setError('')
      return true
    },
    [],
  )

  useEffect(() => {
    const storedIdentity =
      parseStoredIdentity(
        window.localStorage.getItem(
          STORAGE_KEY,
        ),
      )

    if (!storedIdentity) {
      setRestoring(false)
      return
    }

    setIdentity(storedIdentity)

    void synchronizeState(
      storedIdentity,
    ).finally(() => {
      setRestoring(false)
    })
  }, [synchronizeState])

  useEffect(() => {
    void loadScores()

    const channel = supabase
      .channel('anniv-2026-secret-mission-scores')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'secret_mission_scoreboard',
        },
        () => {
          void loadScores()
        },
      )
      .subscribe()

    const interval = window.setInterval(
      () => {
        void loadScores()
      },
      15000,
    )

    return () => {
      window.clearInterval(interval)
      void supabase.removeChannel(channel)
    }
  }, [loadScores])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'hidden'
      ) {
        setRevealed(false)
        return
      }

      if (identity) {
        void synchronizeState(
          identity,
          true,
        )
      }
    }

    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange,
    )

    return () => {
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      )
    }
  }, [identity, synchronizeState])

  const claimIdentity = async () => {
    if (!selectedPlayerKey || busy) {
      return
    }

    setBusy(true)
    setError('')
    setMessage('')

    const sessionToken =
      crypto.randomUUID()

    const { data, error: rpcError } =
      await supabase.rpc(
        'claim_secret_mission',
        {
          p_player_key: selectedPlayerKey,
          p_session_token: sessionToken,
        },
      )

    setBusy(false)

    if (rpcError) {
      console.error(
        'Unable to claim secret mission identity:',
        rpcError,
      )
      setError(
        'Impossible de démarrer les missions pour le moment.',
      )
      return
    }

    const nextState =
      data as MissionState

    if (!nextState.ok) {
      setError(
        missionErrorMessage(
          nextState.code,
        ),
      )
      return
    }

    const nextIdentity = {
      playerKey: selectedPlayerKey,
      sessionToken,
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(nextIdentity),
    )

    setIdentity(nextIdentity)
    setMissionState(nextState)
    setRevealed(false)
    setMessage(
      'Identité verrouillée sur ce téléphone. Ta mission est prête.',
    )

    void loadScores()
  }

  const completeMission = async () => {
    const mission = missionState?.mission

    if (
      !identity ||
      !mission ||
      busy
    ) {
      return
    }

    if (
      !window.confirm(
        'Mission réellement accomplie ? Elle comptera immédiatement dans le classement.',
      )
    ) {
      return
    }

    setBusy(true)
    setError('')
    setMessage('')

    const { data, error: rpcError } =
      await supabase.rpc(
        'complete_secret_mission',
        {
          p_player_key:
            identity.playerKey,
          p_session_token:
            identity.sessionToken,
          p_mission_id: mission.id,
        },
      )

    setBusy(false)

    if (rpcError) {
      console.error(
        'Unable to complete secret mission:',
        rpcError,
      )
      setError(
        'Impossible de valider la mission.',
      )
      return
    }

    const nextState =
      data as MissionState

    if (!nextState.ok) {
      setError(
        missionErrorMessage(
          nextState.code,
        ),
      )
      await synchronizeState(identity, true)
      return
    }

    setMissionState(nextState)
    setRevealed(false)
    setMessage('Mission réussie. +1 au compteur ⚡')

    if ('vibrate' in navigator) {
      navigator.vibrate?.([60, 40, 110])
    }

    void loadScores()
  }

  const skipMission = async () => {
    const mission = missionState?.mission

    if (
      !identity ||
      !mission ||
      busy ||
      (missionState?.skipsRemaining ?? 0) < 1
    ) {
      return
    }

    if (
      !window.confirm(
        'Utiliser ton unique joker pour changer cette mission ?',
      )
    ) {
      return
    }

    setBusy(true)
    setError('')
    setMessage('')

    const { data, error: rpcError } =
      await supabase.rpc(
        'skip_secret_mission',
        {
          p_player_key:
            identity.playerKey,
          p_session_token:
            identity.sessionToken,
          p_mission_id: mission.id,
        },
      )

    setBusy(false)

    if (rpcError) {
      console.error(
        'Unable to skip secret mission:',
        rpcError,
      )
      setError(
        'Impossible d’utiliser le joker.',
      )
      return
    }

    const nextState =
      data as MissionState

    if (!nextState.ok) {
      setError(
        missionErrorMessage(
          nextState.code,
        ),
      )
      await synchronizeState(identity, true)
      return
    }

    setMissionState(nextState)
    setRevealed(false)
    setMessage('Joker utilisé. Nouvelle mission attribuée.')
  }

  const mission = missionState?.mission
  useEffect(() => {
    if (identity && missionState?.ok) rememberMission(identity.playerKey, !!mission)
  }, [identity, missionState?.ok, mission])

  return (
    <main className="missions-page">
      <div className="missions-page__glow missions-page__glow--one" />
      <div className="missions-page__glow missions-page__glow--two" />

      <header className="missions-header">
        <div className="missions-header__navigation">
          <Link to="/" className="back-link">
            ← Accueil
          </Link>

          {isAdmin && (
            <Link
              to="/admin/missions"
              className="missions-admin-link"
            >
              Gérer les missions
            </Link>
          )}
        </div>

        <p className="missions-eyebrow">
          Anniv 2026 / infiltration
        </p>

        <h1>
          Missions
          <span>secrètes</span>
        </h1>

        <p className="missions-header__description">
          Accomplis ton objectif sans te faire griller. Ta mission reste liée à ce téléphone et se masque automatiquement quand tu quittes l’onglet.
        </p>
      </header>

      {error && (
        <div className="missions-message missions-message--error">
          {error}
        </div>
      )}

      {message && (
        <div className="missions-message missions-message--success">
          {message}
        </div>
      )}

      {restoring || guestsLoading ? (
        <section className="missions-loading">
          <span>◌</span>
          <strong>Connexion au réseau...</strong>
        </section>
      ) : !identity || !missionState?.ok ? (
        <section className="missions-onboarding">
          <div className="missions-onboarding__intro">
            <p className="missions-eyebrow">
              Étape 01
            </p>

            <h2>Qui es-tu ?</h2>

            <p>
              Choisis ton nom une seule fois. L’identité sera ensuite verrouillée sur ce téléphone pour éviter que quelqu’un joue à la place d’un autre.
            </p>
          </div>

          {availablePlayers.length === 0 ? (
            <div className="missions-empty">
              Aucun participant confirmé n’est disponible pour le moment.
            </div>
          ) : (
            <div className="missions-identity-form">
              <label htmlFor="mission-player">
                Ton identité
              </label>

              <select
                id="mission-player"
                value={selectedPlayerKey}
                disabled={busy}
                onChange={(event) =>
                  setSelectedPlayerKey(
                    event.target.value,
                  )
                }
              >
                <option value="">
                  Choisir mon nom...
                </option>

                {availablePlayers.map((player) => (
                  <option
                    key={player.key}
                    value={player.key}
                  >
                    {player.name} — {player.detail}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className="missions-primary-button"
                disabled={
                  !selectedPlayerKey || busy
                }
                onClick={() => {
                  void claimIdentity()
                }}
              >
                {busy
                  ? 'Attribution...'
                  : 'C’est bien moi'}
              </button>
            </div>
          )}
        </section>
      ) : (
        <>
          <section className="missions-agent-bar">
            <div>
              <span>Agent</span>
              <strong>
                {missionState.playerName}
              </strong>
            </div>

            <div className="missions-agent-bar__score">
              <strong>
                {missionState.completedCount ?? 0}
              </strong>
              <span>réussie{(missionState.completedCount ?? 0) !== 1 ? 's' : ''}</span>
            </div>
          </section>

          <section
            className={`mission-card ${
              revealed
                ? 'mission-card--revealed'
                : 'mission-card--hidden'
            }`}
          >
            <div className="mission-card__top">
              <div>
                <span>Mission en cours</span>
                {mission && (
                  <strong>
                    {difficultyCopy[mission.difficulty]}
                  </strong>
                )}
              </div>

              <span className="mission-card__classification">
                CONFIDENTIEL
              </span>
            </div>

            {mission ? (
              <div className="mission-card__content">
                <p>{mission.text}</p>

                {!revealed && (
                  <button
                    type="button"
                    className="mission-card__reveal"
                    onClick={() =>
                      setRevealed(true)
                    }
                  >
                    <span>◉</span>
                    Révéler ma mission
                  </button>
                )}
              </div>
            ) : (
              <div className="mission-card__content mission-card__content--empty">
                <p>
                  Aucune mission active n’est disponible. L’admin doit alimenter le pool.
                </p>
              </div>
            )}

            {mission && revealed && (
              <div className="mission-card__actions">
                <button
                  type="button"
                  className="missions-secondary-button"
                  disabled={busy}
                  onClick={() => setRevealed(false)}
                >
                  Masquer
                </button>

                <button
                  type="button"
                  className="missions-secondary-button"
                  disabled={
                    busy ||
                    (missionState.skipsRemaining ?? 0) < 1
                  }
                  onClick={() => {
                    void skipMission()
                  }}
                >
                  Joker
                  <span>
                    {missionState.skipsRemaining ?? 0}/1
                  </span>
                </button>

                <button
                  type="button"
                  className="missions-primary-button"
                  disabled={busy}
                  onClick={() => {
                    void completeMission()
                  }}
                >
                  {busy
                    ? 'Validation...'
                    : 'Mission accomplie ✓'}
                </button>
              </div>
            )}
          </section>

          <p className="missions-privacy-note">
            Un seul joker pour la soirée. Ta mission reste la même lorsque tu reviens.
          </p>
        </>
      )}

      <details className="missions-leaderboard"><summary>Voir le classement des missions</summary>
        <div className="missions-section-heading">
          <div>
            <p className="missions-eyebrow">
              Classement public
            </p>
            <h2>Agents actifs</h2>
          </div>

          <span>
            {scores.length} joueur{scores.length !== 1 ? 's' : ''}
          </span>
        </div>

        {scoresLoading ? (
          <div className="missions-leaderboard__empty">
            Synchronisation du classement...
          </div>
        ) : scores.length === 0 ? (
          <div className="missions-leaderboard__empty">
            Personne n’a encore accepté de mission.
          </div>
        ) : (
          <div className="missions-score-list">
            {scores.map((row, index) => (
              <article
                key={row.player_id}
                className="missions-score-row"
              >
                <span className="missions-score-row__rank">
                  {String(index + 1).padStart(2, '0')}
                </span>

                <strong>{row.player_name}</strong>

                <div>
                  <strong>{row.completed_count}</strong>
                  <span>
                    mission{row.completed_count !== 1 ? 's' : ''}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </details>
    </main>
  )
}

export default SecretMissions
