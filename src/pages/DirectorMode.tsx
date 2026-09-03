import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { Link } from 'react-router-dom'

import { useGuests } from '../features/guests/GuestsContext'
import {
  isPartyModuleVisible,
  type PartyModule,
  type PartyPhase,
  type PartySettings,
  useParty,
} from '../features/party/PartyContext'
import { supabase } from '../lib/supabase'

import './DirectorMode.css'
import TvStatus from '../features/party/TvStatus'

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

type RoomMode =
  | 'likely'
  | 'majority'
  | 'predict'
  | 'who_said'

type RoomStage =
  | 'single'
  | 'nomination'
  | 'final'

type RoomPublicState = {
  phase: 'idle' | 'open' | 'revealed'
  roundId?: string | null
  mode?: RoomMode
  stage?: RoomStage
  prompt?: string
  voteCount?: number
  closesAt?: string | null
}

type RoomStateRow = {
  state: RoomPublicState | null
}

type RoomPlayerRow = {
  player_key: string
  score: number
}

type MissionScoreRow = {
  player_id: string
  completed_count: number
}

type MissionPromptRow = {
  id: string
  is_active: boolean
}

type PhotoHuntChallengeRow = {
  id: string
  is_active: boolean
}

type PhotoHuntSubmissionStatus =
  | 'pending'
  | 'approved'
  | 'rejected'

type PhotoHuntSubmissionRow = {
  id: string
  status: PhotoHuntSubmissionStatus
}

type RpcResult = {
  ok: boolean
  code?: string
}

type DirectorModule = PartyModule | 'photos'

const phaseOptions: Array<{
  value: PartyPhase
  label: string
}> = [
  { value: 'preparation', label: 'Préparation' },
  { value: 'live', label: 'En cours' },
  { value: 'ended', label: 'Terminée' },
]

const moduleOptions: Array<{
  value: DirectorModule
  label: string
  shortLabel: string
  href: string
}> = [
  {
    value: 'room',
    label: 'La Salle',
    shortLabel: 'Salle',
    href: '/room',
  },
  {
    value: 'beer-pong',
    label: 'Beer Pong',
    shortLabel: 'Pong',
    href: '/beer-pong',
  },
  {
    value: 'missions',
    label: 'Missions secrètes',
    shortLabel: 'Missions',
    href: '/missions',
  },
  {
    value: 'bingo',
    label: 'Bingo',
    shortLabel: 'Bingo',
    href: '/bingo',
  },
  {
    value: 'iceberg',
    label: 'Iceberg',
    shortLabel: 'Iceberg',
    href: '/iceberg',
  },
  {
    value: 'photos',
    label: 'Photo Hunt',
    shortLabel: 'Photos',
    href: '/photos',
  },
  {
    value: 'guests',
    label: 'Invités',
    shortLabel: 'Invités',
    href: '/guests',
  },
]

const roomModeCopy: Record<RoomMode, string> = {
  likely: 'Plus susceptible de…',
  majority: 'Majority Rules',
  predict: 'Devine le groupe',
  who_said: 'Qui a répondu ça ?',
}

function visibilityPatch(
  module: DirectorModule,
  visible: boolean,
): Partial<PartySettings> {
  switch (module) {
    case 'iceberg':
      return { icebergVisible: visible }
    case 'beer-pong':
      return { beerPongVisible: visible }
    case 'bingo':
      return { bingoVisible: visible }
    case 'missions':
      return { missionsVisible: visible }
    case 'room':
      return { roomVisible: visible }
    case 'photos':
      return { photosVisible: visible }
    case 'guests':
      return { guestsVisible: visible }
  }
}

function roomCommandError(code?: string) {
  switch (code) {
    case 'NOT_ENOUGH_NOMINATIONS':
      return 'Pas encore assez de nominations différentes pour générer la finale.'
    case 'FINAL_NOT_STARTED':
      return 'La finale doit être lancée avant la révélation.'
    case 'NO_ACTIVE_ROUND':
      return 'Aucun round La Salle n’est actif.'
    default:
      return 'La commande La Salle n’a pas pu être exécutée.'
  }
}

function DirectorMode() {
  const { guests } = useGuests()
  const {
    settings,
    loading: partyLoading,
    saving: partySaving,
    error: partyError,
    updateSettings,
  } = useParty()

  const [beerPongState, setBeerPongState] =
    useState<BeerPongState>({})
  const [roomState, setRoomState] =
    useState<RoomPublicState>({ phase: 'idle' })
  const [roomPlayers, setRoomPlayers] =
    useState<RoomPlayerRow[]>([])
  const [missionPlayers, setMissionPlayers] =
    useState<MissionScoreRow[]>([])
  const [missionPromptCount, setMissionPromptCount] =
    useState(0)
  const [photoChallenges, setPhotoChallenges] =
    useState<PhotoHuntChallengeRow[]>([])
  const [photoSubmissions, setPhotoSubmissions] =
    useState<PhotoHuntSubmissionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyAction, setBusyAction] =
    useState<string | null>(null)
  const [lastSync, setLastSync] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())

  const confirmedParticipantCount = useMemo(
    () => guests
      .filter((guest) => guest.status === 'confirmed')
      .reduce(
        (total, guest) => total + 1 + guest.plusOnes.length,
        0,
      ),
    [guests],
  )

  const loadLiveData = useCallback(async () => {
    const [
      beerPongResult,
      roomStateResult,
      roomPlayerResult,
      missionScoreResult,
      missionPromptResult,
      photoChallengeResult,
      photoSubmissionResult,
    ] = await Promise.all([
      supabase
        .from('beer_pong_state')
        .select('state')
        .eq('id', 'main')
        .maybeSingle(),
      supabase
        .from('live_vote_public_state')
        .select('state')
        .eq('id', 'main')
        .maybeSingle(),
      supabase
        .from('live_vote_players')
        .select('player_key, score'),
      supabase
        .from('secret_mission_scoreboard')
        .select('player_id, completed_count'),
      supabase
        .from('secret_mission_prompts')
        .select('id, is_active'),
      supabase
        .from('photo_hunt_challenges')
        .select('id, is_active'),
      supabase
        .from('photo_hunt_submissions')
        .select('id, status'),
    ])

    let hasError = false

    if (beerPongResult.error) {
      console.error(
        'Unable to load Director Beer Pong state:',
        beerPongResult.error,
      )
      hasError = true
    } else {
      const row = beerPongResult.data as BeerPongRow | null
      setBeerPongState(row?.state ?? {})
    }

    if (roomStateResult.error) {
      console.error(
        'Unable to load Director La Salle state:',
        roomStateResult.error,
      )
      hasError = true
    } else {
      const row = roomStateResult.data as RoomStateRow | null
      setRoomState(row?.state ?? { phase: 'idle' })
    }

    if (roomPlayerResult.error) {
      console.error(
        'Unable to load Director La Salle players:',
        roomPlayerResult.error,
      )
      hasError = true
    } else {
      setRoomPlayers(
        (roomPlayerResult.data ?? []) as RoomPlayerRow[],
      )
    }

    if (missionScoreResult.error) {
      console.error(
        'Unable to load Director mission scores:',
        missionScoreResult.error,
      )
      hasError = true
    } else {
      setMissionPlayers(
        (missionScoreResult.data ?? []) as MissionScoreRow[],
      )
    }

    if (missionPromptResult.error) {
      console.error(
        'Unable to load Director mission prompts:',
        missionPromptResult.error,
      )
      hasError = true
    } else {
      const rows =
        (missionPromptResult.data ?? []) as MissionPromptRow[]
      setMissionPromptCount(
        rows.filter((prompt) => prompt.is_active).length,
      )
    }

    if (photoChallengeResult.error) {
      console.error(
        'Unable to load Director Photo Hunt challenges:',
        photoChallengeResult.error,
      )
      hasError = true
    } else {
      setPhotoChallenges(
        (photoChallengeResult.data ?? []) as PhotoHuntChallengeRow[],
      )
    }

    if (photoSubmissionResult.error) {
      console.error(
        'Unable to load Director Photo Hunt submissions:',
        photoSubmissionResult.error,
      )
      hasError = true
    } else {
      setPhotoSubmissions(
        (photoSubmissionResult.data ?? []) as PhotoHuntSubmissionRow[],
      )
    }

    setError(
      hasError
        ? 'Certaines données live n’ont pas pu être synchronisées.'
        : '',
    )
    setLastSync(Date.now())
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadLiveData()
  }, [loadLiveData])

  useEffect(() => {
    const channel = supabase
      .channel('anniv-2026-director-mode')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'beer_pong_state',
        },
        () => void loadLiveData(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_vote_public_state',
          filter: 'id=eq.main',
        },
        () => void loadLiveData(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'secret_mission_scoreboard',
        },
        () => void loadLiveData(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'photo_hunt_submissions',
        },
        () => void loadLiveData(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'photo_hunt_challenges',
        },
        () => void loadLiveData(),
      )
      .subscribe()

    const refreshInterval = window.setInterval(
      () => void loadLiveData(),
      10000,
    )

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void loadLiveData()
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
  }, [loadLiveData])

  useEffect(() => {
    if (
      roomState.phase !== 'open' ||
      !roomState.closesAt
    ) {
      return
    }

    const interval = window.setInterval(
      () => setNow(Date.now()),
      1000,
    )

    return () => window.clearInterval(interval)
  }, [roomState.closesAt, roomState.phase])

  const secondsLeft = roomState.closesAt
    ? Math.max(
      0,
      Math.ceil(
        (
          new Date(roomState.closesAt).getTime() -
          now
        ) / 1000,
      ),
    )
    : null

  const selectedPlayerCount =
    beerPongState.selectedPlayerIds?.length ?? 0
  const teamCount = beerPongState.teams?.length ?? 0
  const roundCount = beerPongState.rounds?.length ?? 0

  const beerPongStatus = useMemo(() => {
    if (beerPongState.championTeamId) {
      return {
        label: 'Terminé',
        detail: 'Le tournoi a son champion.',
        tone: 'done',
      }
    }

    if (beerPongState.draftValidated) {
      return {
        label: 'En cours',
        detail:
          `${teamCount} équipe${teamCount !== 1 ? 's' : ''} · ${roundCount} tour${roundCount !== 1 ? 's' : ''}`,
        tone: 'live',
      }
    }

    if (teamCount > 0) {
      return {
        label: 'Draft prête',
        detail:
          `${teamCount} équipe${teamCount !== 1 ? 's' : ''} à valider`,
        tone: 'ready',
      }
    }

    if (selectedPlayerCount > 0) {
      return {
        label: 'Préparation',
        detail:
          `${selectedPlayerCount} joueur${selectedPlayerCount !== 1 ? 's' : ''} sélectionné${selectedPlayerCount !== 1 ? 's' : ''}`,
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

  const missionCompleted = missionPlayers.reduce(
    (total, player) => total + player.completed_count,
    0,
  )

  const roomScore = roomPlayers.reduce(
    (total, player) => total + player.score,
    0,
  )

  const activePhotoChallengeCount = photoChallenges.filter(
    (challenge) => challenge.is_active,
  ).length
  const pendingPhotoCount = photoSubmissions.filter(
    (submission) => submission.status === 'pending',
  ).length
  const approvedPhotoCount = photoSubmissions.filter(
    (submission) => submission.status === 'approved',
  ).length
  const photoHuntFeatured =
    (settings.featuredModule as string | null) === 'photos'

  const currentFeatured = moduleOptions.find(
    (module) => module.value === (settings.featuredModule as string | null),
  )

  const runRoomRpc = async (name: string) => {
    if (busyAction) return

    setBusyAction(name)
    setError('')

    const { data, error: rpcError } =
      await supabase.rpc(name)

    if (rpcError) {
      console.error(
        `Unable to run Director command ${name}:`,
        rpcError,
      )
      setError('La commande La Salle n’a pas pu être exécutée.')
      setBusyAction(null)
      return
    }

    const result = data as RpcResult | null

    if (!result?.ok) {
      setError(roomCommandError(result?.code))
      setBusyAction(null)
      return
    }

    setBusyAction(null)
    await loadLiveData()
  }

  const featureModule = async (module: DirectorModule) => {
    const patch: Partial<PartySettings> = {
      featuredModule: module as PartyModule,
    }

    if (!isPartyModuleVisible(settings, module)) {
      Object.assign(
        patch,
        visibilityPatch(module, true),
      )
    }

    await updateSettings(patch)
  }

  const toggleModule = async (module: DirectorModule) => {
    const currentlyVisible =
      isPartyModuleVisible(settings, module)

    const patch: Partial<PartySettings> = {
      ...visibilityPatch(module, !currentlyVisible),
    }

    if (
      currentlyVisible &&
      (settings.featuredModule as string | null) === module
    ) {
      patch.featuredModule = null
    }

    await updateSettings(patch)
  }

  const roomStageLabel =
    roomState.mode === 'likely'
      ? roomState.stage === 'nomination'
        ? 'Étape 1/2 · Nominations'
        : roomState.stage === 'final'
          ? 'Étape 2/2 · Finale'
          : 'Vote'
      : 'Vote unique'

  const roomPrimaryAction =
    roomState.phase === 'open'
      ? roomState.mode === 'likely' &&
        roomState.stage === 'nomination'
        ? {
          label: 'Passer au Top 4 →',
          rpc: 'admin_advance_likely_vote',
        }
        : {
          label: 'Révéler les résultats',
          rpc: 'admin_reveal_live_vote',
        }
      : roomState.phase === 'revealed'
        ? {
          label: 'Fermer le round',
          rpc: 'admin_clear_live_vote',
        }
        : null

  return (
    <main className="director-mode">
      <div className="director-mode__glow director-mode__glow--one" />
      <div className="director-mode__glow director-mode__glow--two" />

      <header className="director-header">
        <div className="director-header__nav">
          <Link to="/admin" className="back-link">
            ← Control Room
          </Link>

          <div className="director-header__links">
            <Link to="/qr">QR</Link>
            <Link to="/">Home ↗</Link>
          </div>
        </div>

        <div className="director-header__main">
          <div>
            <p className="director-eyebrow">
              Anniv 2026 / jour J
            </p>
            <h1>
              Mode
              <span>Directeur</span>
            </h1>
            <p className="director-header__description">
              Les commandes qui comptent pendant la soirée,
              sans naviguer entre les pages d’administration.
            </p>
          </div>

          <div
            className={`director-live-badge director-live-badge--${settings.phase}`}
          >
            <span />
            <div>
              <small>État global</small>
              <strong>
                {settings.phase === 'preparation'
                  ? 'Préparation'
                  : settings.phase === 'live'
                    ? 'Soirée en cours'
                    : 'Soirée terminée'}
              </strong>
            </div>
          </div>
        </div>
      </header>

      {(error || partyError) && (
        <div className="director-error">
          {error || partyError}
        </div>
      )}

      <TvStatus />
      <section className="director-command-bar">
        <div className="director-command-bar__phase">
          <span>État de la soirée</span>
          <div>
            {phaseOptions.map((phase) => (
              <button
                key={phase.value}
                type="button"
                className={
                  settings.phase === phase.value
                    ? 'director-phase director-phase--active'
                    : 'director-phase'
                }
                disabled={partyLoading || partySaving}
                onClick={() =>
                  void updateSettings({ phase: phase.value })
                }
              >
                {phase.label}
              </button>
            ))}
          </div>
        </div>

        <div className="director-command-bar__stats">
          <div>
            <strong>{confirmedParticipantCount}</strong>
            <span>participants</span>
          </div>
          <div>
            <strong>{roomPlayers.length}</strong>
            <span>dans La Salle</span>
          </div>
          <div>
            <strong>{missionPlayers.length}</strong>
            <span>agents</span>
          </div>
        </div>
      </section>

      <details className="director-featured"><summary>Choisir le module à mettre en avant</summary>
        <div className="director-section-heading">
          <div>
            <p className="director-eyebrow">À la une</p>
            <h2>
              {currentFeatured
                ? currentFeatured.label
                : 'Aucun module mis en avant'}
            </h2>
          </div>
          {settings.featuredModule && (
            <button
              type="button"
              className="director-text-button"
              disabled={partySaving}
              onClick={() =>
                void updateSettings({ featuredModule: null })
              }
            >
              Retirer
            </button>
          )}
        </div>

        <div className="director-featured__modules">
          {moduleOptions.map((module) => {
            const active =
              (settings.featuredModule as string | null) === module.value
            return (
              <button
                key={module.value}
                type="button"
                className={
                  active
                    ? 'director-featured-button director-featured-button--active'
                    : 'director-featured-button'
                }
                disabled={partyLoading || partySaving}
                onClick={() => void featureModule(module.value)}
              >
                <span>{module.shortLabel}</span>
                <small>
                  {active ? 'À la une' : 'Mettre en avant'}
                </small>
              </button>
            )
          })}
        </div>
      </details>

      <section className="director-grid">
        <article className="director-panel director-panel--room director-panel--wide">
          <div className="director-panel__top">
            <div>
              <p className="director-eyebrow">Vote collectif</p>
              <h2>La Salle</h2>
            </div>
            <span
              className={`director-status director-status--${roomState.phase}`}
            >
              {roomState.phase === 'idle'
                ? 'En attente'
                : roomState.phase === 'open'
                  ? 'Vote ouvert'
                  : 'Révélé'}
            </span>
          </div>

          {roomState.phase === 'idle' ? (
            <div className="director-panel__empty">
              <strong>Aucun round en cours</strong>
              <p>
                Lance une question depuis la régie complète,
                puis pilote le round directement ici.
              </p>
            </div>
          ) : (
            <div className="director-room-live">
              <div className="director-room-live__meta">
                <span>
                  {roomState.mode
                    ? roomModeCopy[roomState.mode]
                    : 'La Salle'}
                </span>
                {roomState.phase === 'open' && (
                  <strong>{roomStageLabel}</strong>
                )}
              </div>

              <h3>{roomState.prompt}</h3>

              <div className="director-room-live__numbers">
                <div>
                  <strong>{roomState.voteCount ?? 0}</strong>
                  <span>
                    / {confirmedParticipantCount || '—'} votes
                  </span>
                </div>

                {secondsLeft !== null && (
                  <div
                    className={
                      secondsLeft <= 5
                        ? 'director-timer director-timer--urgent'
                        : 'director-timer'
                    }
                  >
                    <strong>{secondsLeft}</strong>
                    <span>sec.</span>
                  </div>
                )}
              </div>

              <div className="director-room-live__actions">
                {roomPrimaryAction && (
                  <button
                    type="button"
                    className="director-primary-action"
                    disabled={Boolean(busyAction)}
                    onClick={() =>
                      void runRoomRpc(roomPrimaryAction.rpc)
                    }
                  >
                    {busyAction === roomPrimaryAction.rpc
                      ? 'Commande…'
                      : roomPrimaryAction.label}
                  </button>
                )}

                {roomState.phase === 'open' && (
                  <button
                    type="button"
                    className="director-secondary-action"
                    disabled={Boolean(busyAction)}
                    onClick={() =>
                      void runRoomRpc('admin_skip_live_vote')
                    }
                  >
                    Passer la question
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="director-panel__footer">
            <button
              type="button"
              className={
                settings.featuredModule === 'room'
                  ? 'director-feature director-feature--active'
                  : 'director-feature'
              }
              disabled={partySaving}
              onClick={() => void featureModule('room')}
            >
              {settings.featuredModule === 'room'
                ? '✓ À la une'
                : 'Mettre à la une'}
            </button>
            <Link to="/admin/room">Régie complète ↗</Link>
            <Link to="/room">Vue publique ↗</Link>
          </div>
        </article>

        <article className="director-panel director-panel--beer">
          <div className="director-panel__top">
            <div>
              <p className="director-eyebrow">Tournoi</p>
              <h2>Beer Pong</h2>
            </div>
            <span
              className={`director-status director-status--${beerPongStatus.tone}`}
            >
              {beerPongStatus.label}
            </span>
          </div>

          <div className="director-stat-grid">
            <div>
              <strong>{selectedPlayerCount}</strong>
              <span>joueurs</span>
            </div>
            <div>
              <strong>{teamCount}</strong>
              <span>équipes</span>
            </div>
            <div>
              <strong>{roundCount}</strong>
              <span>tours</span>
            </div>
          </div>

          <p className="director-panel__note">
            {beerPongStatus.detail}
          </p>

          <div className="director-panel__footer">
            <button
              type="button"
              className={
                settings.featuredModule === 'beer-pong'
                  ? 'director-feature director-feature--active'
                  : 'director-feature'
              }
              disabled={partySaving}
              onClick={() => void featureModule('beer-pong')}
            >
              {settings.featuredModule === 'beer-pong'
                ? '✓ À la une'
                : 'Mettre à la une'}
            </button>
            <Link to="/beer-pong">Ouvrir ↗</Link>
          </div>
        </article>

        <article className="director-panel director-panel--missions">
          <div className="director-panel__top">
            <div>
              <p className="director-eyebrow">Infiltration</p>
              <h2>Missions</h2>
            </div>
            <span className="director-status director-status--ready">
              {missionPlayers.length} agents
            </span>
          </div>

          <div className="director-stat-grid">
            <div>
              <strong>{missionPromptCount}</strong>
              <span>actives</span>
            </div>
            <div>
              <strong>{missionPlayers.length}</strong>
              <span>agents</span>
            </div>
            <div>
              <strong>{missionCompleted}</strong>
              <span>réussites</span>
            </div>
          </div>

          <p className="director-panel__note">
            {missionPlayers.length === 0
              ? 'Aucun agent lié pour le moment.'
              : `${missionCompleted} mission${missionCompleted !== 1 ? 's' : ''} accomplie${missionCompleted !== 1 ? 's' : ''}.`}
          </p>

          <div className="director-panel__footer">
            <button
              type="button"
              className={
                settings.featuredModule === 'missions'
                  ? 'director-feature director-feature--active'
                  : 'director-feature'
              }
              disabled={partySaving}
              onClick={() => void featureModule('missions')}
            >
              {settings.featuredModule === 'missions'
                ? '✓ À la une'
                : 'Mettre à la une'}
            </button>
            <Link to="/admin/missions">Gérer ↗</Link>
          </div>
        </article>

        <article className="director-panel director-panel--photos">
          <div className="director-panel__top">
            <div>
              <p className="director-eyebrow">Chasse photo</p>
              <h2>Photo Hunt</h2>
            </div>
            <span
              className={
                pendingPhotoCount > 0
                  ? 'director-status director-status--live'
                  : 'director-status director-status--ready'
              }
            >
              {pendingPhotoCount > 0
                ? `${pendingPhotoCount} à valider`
                : `${approvedPhotoCount} publiée${approvedPhotoCount !== 1 ? 's' : ''}`}
            </span>
          </div>

          <div className="director-stat-grid">
            <div>
              <strong>{activePhotoChallengeCount}</strong>
              <span>défis actifs</span>
            </div>
            <div>
              <strong>{pendingPhotoCount}</strong>
              <span>à valider</span>
            </div>
            <div>
              <strong>{approvedPhotoCount}</strong>
              <span>publiées</span>
            </div>
          </div>

          <p className="director-panel__note">
            {pendingPhotoCount > 0
              ? `${pendingPhotoCount} photo${pendingPhotoCount !== 1 ? 's' : ''} attend${pendingPhotoCount !== 1 ? 'ent' : ''} la régie.`
              : approvedPhotoCount > 0
                ? `${approvedPhotoCount} photo${approvedPhotoCount !== 1 ? 's' : ''} sur le mur collectif.`
                : 'Aucune photo publiée pour le moment.'}
          </p>

          <div className="director-panel__footer">
            <button
              type="button"
              className={
                photoHuntFeatured
                  ? 'director-feature director-feature--active'
                  : 'director-feature'
              }
              disabled={partySaving}
              onClick={() => void featureModule('photos')}
            >
              {photoHuntFeatured
                ? '✓ À la une'
                : 'Mettre à la une'}
            </button>
            <Link to="/admin/photos">Modérer ↗</Link>
            <Link to="/photos">Vue publique ↗</Link>
          </div>
        </article>

        <details className="director-panel director-panel--public"><summary>Préparation · visibilité des modules</summary>
          <div className="director-panel__top">
            <div>
              <p className="director-eyebrow">Accès</p>
              <h2>Visibilité publique</h2>
            </div>
          </div>

          <div className="director-visibility-list">
            {moduleOptions.map((module) => {
              const visible =
                isPartyModuleVisible(settings, module.value)
              return (
                <button
                  key={module.value}
                  type="button"
                  className={
                    visible
                      ? 'director-visibility director-visibility--on'
                      : 'director-visibility'
                  }
                  aria-pressed={visible}
                  disabled={partyLoading || partySaving}
                  onClick={() => void toggleModule(module.value)}
                >
                  <span>{module.label}</span>
                  <strong>{visible ? 'Visible' : 'Masqué'}</strong>
                  <i aria-hidden="true" />
                </button>
              )
            })}
          </div>
        </details>

        <details className="director-panel director-panel--health"><summary>Statistiques de la soirée</summary>
          <div className="director-panel__top">
            <div>
              <p className="director-eyebrow">Vue rapide</p>
              <h2>Soirée</h2>
            </div>
          </div>

          <div className="director-health-list">
            <div>
              <span>Participants confirmés</span>
              <strong>{confirmedParticipantCount}</strong>
            </div>
            <div>
              <span>La Salle</span>
              <strong>
                {roomState.phase === 'open'
                  ? `${roomState.voteCount ?? 0} votes`
                  : roomState.phase === 'revealed'
                    ? 'Résultats sortis'
                    : 'En attente'}
              </strong>
            </div>
            <div>
              <span>Points La Salle</span>
              <strong>{roomScore}</strong>
            </div>
            <div>
              <span>Missions accomplies</span>
              <strong>{missionCompleted}</strong>
            </div>
            <div>
              <span>Photos publiées</span>
              <strong>{approvedPhotoCount}</strong>
            </div>
            <div>
              <span>Photos à valider</span>
              <strong>{pendingPhotoCount}</strong>
            </div>
            <div>
              <span>Dernière synchro</span>
              <strong>
                {lastSync
                  ? new Date(lastSync).toLocaleTimeString(
                    'fr-FR',
                    {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    },
                  )
                  : '—'}
              </strong>
            </div>
          </div>

          <button
            type="button"
            className="director-refresh"
            disabled={loading}
            onClick={() => void loadLiveData()}
          >
            {loading ? 'Synchronisation…' : 'Rafraîchir maintenant'}
          </button>
        </details>
      </section>

      <section className="director-shortcuts">
        <Link to="/qr" className="director-shortcut">
          <span>▦</span>
          <div>
            <small>Invités</small>
            <strong>Afficher le QR</strong>
          </div>
        </Link>
        <Link to="/admin/room" className="director-shortcut">
          <span>◉</span>
          <div>
            <small>Vote live</small>
            <strong>Préparer La Salle</strong>
          </div>
        </Link>
        <Link to="/admin/missions" className="director-shortcut">
          <span>◎</span>
          <div>
            <small>Contenu</small>
            <strong>Gérer les missions</strong>
          </div>
        </Link>
        <Link to="/admin/photos" className="director-shortcut">
          <span>▣</span>
          <div>
            <small>Photo Hunt</small>
            <strong>Modérer les photos</strong>
          </div>
        </Link>
        <Link to="/admin" className="director-shortcut">
          <span>⌘</span>
          <div>
            <small>Administration</small>
            <strong>Control Room</strong>
          </div>
        </Link>
      </section>
    </main>
  )
}

export default DirectorMode
