import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  type PartyModule,
  useParty,
} from '../features/party/PartyContext'
import { supabase } from '../lib/supabase'
import PhotoHuntScreen from './PhotoHuntScreen'

import './PartyScreen.css'

type VoteMode =
  | 'likely'
  | 'majority'
  | 'predict'
  | 'who_said'

type VoteResultRow = {
  key: string
  label: string
  count: number
  percentage: number
  correct?: boolean
}

type VoteResult = {
  rows: VoteResultRow[]
  totalVotes: number
  winnerKeys: string[]
  correctKey?: string | null
}

type RoomPublicState = {
  phase: 'idle' | 'open' | 'revealed'
  roundId?: string | null
  mode?: VoteMode
  stage?: 'single' | 'nomination' | 'final'
  prompt?: string
  voteCount?: number
  closesAt?: string | null
  result?: VoteResult | null
  revealNote?: string
}

type RoomStateRow = {
  state: RoomPublicState | null
}

type PlayerSnapshot = {
  id: string
  name: string
}

type Team = {
  id: string
  playerIds: [string, string]
}

type Match = {
  id: string
  teamAId: string | null
  teamBId: string | null
  winnerTeamId: string | null
}

type BeerPongState = {
  selectedPlayerIds?: string[]
  playerSnapshots?: PlayerSnapshot[]
  teams?: Team[]
  draftValidated?: boolean
  rounds?: Match[][]
  championTeamId?: string | null
}

type BeerPongRow = {
  state: BeerPongState | null
}

type MissionScoreRow = {
  player_id: string
  completed_count: number
}

const moduleCopy: Record<
  PartyModule,
  {
    eyebrow: string
    title: string
    detail: string
    route: string
  }
> = {
  room: {
    eyebrow: 'Vote collectif',
    title: 'La Salle',
    detail: 'Vote depuis ton téléphone et regarde la salle trancher.',
    route: '/room',
  },
  'beer-pong': {
    eyebrow: 'Tournoi',
    title: 'Beer Pong',
    detail: 'Le tournoi est en cours. Retrouve le tableau complet sur ton téléphone.',
    route: '/beer-pong',
  },
  missions: {
    eyebrow: 'Infiltration',
    title: 'Missions secrètes',
    detail: 'Garde ta mission pour toi. Fais-la sans te faire griller.',
    route: '/missions',
  },
  bingo: {
    eyebrow: 'Jeu personnel',
    title: 'Bingo',
    detail: 'Ta grille est sur ton téléphone. Une ligne suffit pour faire Bingo.',
    route: '/bingo',
  },
  iceberg: {
    eyebrow: 'Archives',
    title: 'Iceberg',
    detail: 'Descends dans les dossiers de la soirée, niveau après niveau.',
    route: '/iceberg',
  },
  guests: {
    eyebrow: 'La soirée',
    title: 'Invités',
    detail: 'Retrouve la liste des participants et les modules depuis l’accueil.',
    route: '/guests',
  },
}

const voteModeCopy: Record<VoteMode, string> = {
  likely: '🔥 Plus susceptible de…',
  majority: '⚖️ Majority Rules',
  predict: '🎯 Devine le groupe',
  who_said: '🕵️ Qui a répondu ça ?',
}

function getRoundName(matches: Match[], index: number) {
  if (matches.length === 1) return 'Finale'
  if (matches.length === 2) return 'Demi-finales'
  if (matches.length === 4) return 'Quarts de finale'
  return `Tour ${index + 1}`
}

function PartyScreen() {
  const {
    settings,
    loading: partyLoading,
  } = useParty()

  const [roomState, setRoomState] = useState<RoomPublicState>({
    phase: 'idle',
  })
  const [beerPongState, setBeerPongState] = useState<BeerPongState>({})
  const [missionScores, setMissionScores] = useState<MissionScoreRow[]>([])
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(Date.now())

  const loadScreenData = useCallback(async () => {
    const [roomResult, beerPongResult, missionResult] = await Promise.all([
      supabase
        .from('live_vote_public_state')
        .select('state')
        .eq('id', 'main')
        .maybeSingle(),
      supabase
        .from('beer_pong_state')
        .select('state')
        .eq('id', 'main')
        .maybeSingle(),
      supabase
        .from('secret_mission_scoreboard')
        .select('player_id, completed_count'),
    ])

    if (!roomResult.error) {
      const row = roomResult.data as RoomStateRow | null
      setRoomState(row?.state ?? { phase: 'idle' })
    } else {
      console.error('Unable to load TV room state:', roomResult.error)
    }

    if (!beerPongResult.error) {
      const row = beerPongResult.data as BeerPongRow | null
      setBeerPongState(row?.state ?? {})
    } else {
      console.error('Unable to load TV Beer Pong state:', beerPongResult.error)
    }

    if (!missionResult.error) {
      setMissionScores((missionResult.data ?? []) as MissionScoreRow[])
    } else {
      console.error('Unable to load TV mission scores:', missionResult.error)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    void loadScreenData()
  }, [loadScreenData])

  useEffect(() => {
    const channel = supabase
      .channel('anniv-2026-party-screen')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_vote_public_state',
          filter: 'id=eq.main',
        },
        () => void loadScreenData(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'beer_pong_state',
          filter: 'id=eq.main',
        },
        () => void loadScreenData(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'secret_mission_scoreboard',
        },
        () => void loadScreenData(),
      )
      .subscribe()

    const fallback = window.setInterval(
      () => void loadScreenData(),
      15000,
    )

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void loadScreenData()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.clearInterval(fallback)
      document.removeEventListener('visibilitychange', handleVisibility)
      void supabase.removeChannel(channel)
    }
  }, [loadScreenData])

  useEffect(() => {
    if (roomState.phase !== 'open' || !roomState.closesAt) return

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
        (new Date(roomState.closesAt).getTime() - now) / 1000,
      ),
    )
    : null

  const missionCompleted = missionScores.reduce(
    (total, player) => total + player.completed_count,
    0,
  )

  const playerById = useMemo(
    () => new Map(
      (beerPongState.playerSnapshots ?? []).map(
        (player) => [player.id, player],
      ),
    ),
    [beerPongState.playerSnapshots],
  )

  const teamById = useMemo(
    () => new Map(
      (beerPongState.teams ?? []).map((team) => [team.id, team]),
    ),
    [beerPongState.teams],
  )

  const teamName = useCallback(
    (teamId: string | null | undefined) => {
      if (!teamId) return '—'
      const team = teamById.get(teamId)
      if (!team) return 'Équipe'

      return team.playerIds
        .map((playerId) => playerById.get(playerId)?.name ?? 'Joueur')
        .join(' & ')
    },
    [playerById, teamById],
  )

  const rounds = beerPongState.rounds ?? []
  const currentRoundIndex = Math.max(0, rounds.length - 1)
  const currentRound = rounds[currentRoundIndex] ?? []
  const currentMatch = currentRound.find(
    (match) =>
      match.teamAId &&
      match.teamBId &&
      !match.winnerTeamId,
  )
  const pendingMatches = currentRound.filter(
    (match) => match.teamAId && match.teamBId && !match.winnerTeamId,
  ).length

  const roomIsLive =
    roomState.phase === 'open' ||
    roomState.phase === 'revealed'

  const activeModule = roomIsLive
    ? 'room'
    : settings.featuredModule

  const sortedResults = useMemo(
    () => [...(roomState.result?.rows ?? [])]
      .sort((a, b) => b.count - a.count),
    [roomState.result?.rows],
  )

  if (loading || partyLoading) {
    return (
      <main className="party-screen party-screen--loading">
        <div className="party-screen__orb party-screen__orb--one" />
        <p>Connexion à la soirée…</p>
      </main>
    )
  }

  if (settings.phase === 'ended') {
    return (
      <main className="party-screen party-screen--ended">
        <div className="party-screen__orb party-screen__orb--one" />
        <div className="party-screen__orb party-screen__orb--two" />
        <section className="party-screen__center-message">
          <p className="party-screen__eyebrow">Anniv 2026</p>
          <h1>Merci pour<br />cette soirée.</h1>
          <p>Les dossiers restent ouverts sur le site.</p>
        </section>
      </main>
    )
  }

  // The router and this screen receive room updates independently. After a
  // skip, we can see "idle" before the router replaces us with the photo wall.
  // Handle Photos here too: it has no entry in the legacy moduleCopy table.
  if (String(activeModule) === 'photos') {
    return <PhotoHuntScreen />
  }

  if (activeModule === 'room' && roomState.phase === 'open') {
    return (
      <main className="party-screen party-screen--room party-screen--room-open">
        <div className="party-screen__orb party-screen__orb--one" />
        <div className="party-screen__orb party-screen__orb--two" />

        <header className="party-screen__topline">
          <div>
            <span className="party-screen__live-dot" />
            La Salle · vote ouvert
          </div>
          <span>
            {roomState.mode
              ? voteModeCopy[roomState.mode]
              : 'Vote collectif'}
          </span>
        </header>

        <section className="party-screen__room-question">
          <p className="party-screen__eyebrow">
            {roomState.mode === 'likely' && roomState.stage === 'final'
              ? '🔥 Finale · Top 4'
              : roomState.mode === 'likely'
                ? '🔥 Nominations'
                : 'Tout le monde vote'}
          </p>

          <h1>{roomState.prompt}</h1>

          <div className="party-screen__room-status">
            <div className="party-screen__vote-count">
              <strong>{roomState.voteCount ?? 0}</strong>
              <span>votes enregistrés</span>
            </div>

            {secondsLeft !== null && (
              <div
                className={
                  secondsLeft <= 5
                    ? 'party-screen__countdown party-screen__countdown--urgent'
                    : 'party-screen__countdown'
                }
              >
                <strong>{secondsLeft}</strong>
                <span>secondes</span>
              </div>
            )}
          </div>

          <div className="party-screen__waiting-line">
            <span />
            Résultats cachés jusqu’à la révélation
          </div>
        </section>
      </main>
    )
  }

  if (activeModule === 'room' && roomState.phase === 'revealed') {
    return (
      <main className="party-screen party-screen--room party-screen--room-revealed">
        <div className="party-screen__orb party-screen__orb--one" />
        <div className="party-screen__orb party-screen__orb--two" />

        <header className="party-screen__topline">
          <div>
            <span className="party-screen__live-dot party-screen__live-dot--result" />
            La Salle · résultats
          </div>
          <span>
            {roomState.result?.totalVotes ?? roomState.voteCount ?? 0} votes
          </span>
        </header>

        <section className="party-screen__results">
          <div className="party-screen__results-heading">
            <p className="party-screen__eyebrow">
              {roomState.mode
                ? voteModeCopy[roomState.mode]
                : 'Le peuple a parlé'}
            </p>
            <h1>{roomState.prompt}</h1>
            {roomState.revealNote && <p>{roomState.revealNote}</p>}
          </div>

          <div className="party-screen__result-list">
            {sortedResults.slice(0, 5).map((row, index) => (
              <div
                key={row.key}
                className={
                  row.correct
                    ? 'party-screen__result party-screen__result--correct'
                    : index === 0
                      ? 'party-screen__result party-screen__result--winner'
                      : 'party-screen__result'
                }
              >
                <span className="party-screen__result-rank">
                  {row.correct ? '✓' : index + 1}
                </span>
                <div className="party-screen__result-main">
                  <div>
                    <strong>{row.label}</strong>
                    <span>{row.count} vote{row.count !== 1 ? 's' : ''}</span>
                  </div>
                  <b>{Math.round(row.percentage)}%</b>
                  <i style={{ width: `${Math.max(2, row.percentage)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    )
  }

  if (activeModule === 'beer-pong') {
    const championName = teamName(beerPongState.championTeamId)

    return (
      <main className="party-screen party-screen--pong">
        <div className="party-screen__orb party-screen__orb--one" />
        <div className="party-screen__orb party-screen__orb--two" />

        <header className="party-screen__topline">
          <div>
            <span className="party-screen__live-dot" />
            Beer Pong
          </div>
          <span>
            {(beerPongState.teams ?? []).length} équipes
          </span>
        </header>

        {beerPongState.championTeamId ? (
          <section className="party-screen__champion">
            <p className="party-screen__eyebrow">🏆 Champions</p>
            <h1>{championName}</h1>
            <p>Le tournoi a parlé.</p>
          </section>
        ) : beerPongState.draftValidated && currentRound.length > 0 ? (
          <section className="party-screen__pong-live">
            <div>
              <p className="party-screen__eyebrow">
                {getRoundName(currentRound, currentRoundIndex)}
              </p>
              <h1>Beer<br />Pong</h1>
              <p>
                {pendingMatches > 0
                  ? `${pendingMatches} match${pendingMatches !== 1 ? 's' : ''} à jouer dans ce tour.`
                  : 'Tour en cours de finalisation.'}
              </p>
            </div>

            {currentMatch ? (
              <div className="party-screen__matchup">
                <span>Prochain duel</span>
                <strong>{teamName(currentMatch.teamAId)}</strong>
                <b>VS</b>
                <strong>{teamName(currentMatch.teamBId)}</strong>
              </div>
            ) : (
              <div className="party-screen__matchup party-screen__matchup--waiting">
                <span>Tournoi en cours</span>
                <strong>Préparez les gobelets.</strong>
              </div>
            )}
          </section>
        ) : (
          <section className="party-screen__feature-promo">
            <div>
              <p className="party-screen__eyebrow">Tournoi</p>
              <h1>Beer<br />Pong</h1>
              <p>Le tournoi sera lancé depuis la régie.</p>
            </div>
            <QrBlock label="Voir le tournoi" />
          </section>
        )}
      </main>
    )
  }

  if (activeModule === 'missions') {
    return (
      <main className="party-screen party-screen--missions">
        <div className="party-screen__orb party-screen__orb--one" />
        <div className="party-screen__orb party-screen__orb--two" />

        <header className="party-screen__topline">
          <div>
            <span className="party-screen__live-dot" />
            Missions secrètes
          </div>
          <span>Opération en cours</span>
        </header>

        <section className="party-screen__mission-live">
          <div>
            <p className="party-screen__eyebrow">Infiltration</p>
            <h1>Reste<br />discret.</h1>
            <p>
              Ta mission reste privée sur ton téléphone.
              Ne te fais pas repérer.
            </p>
          </div>

          <div className="party-screen__mission-stats">
            <div>
              <strong>{missionScores.length}</strong>
              <span>agents actifs</span>
            </div>
            <div>
              <strong>{missionCompleted}</strong>
              <span>missions réussies</span>
            </div>
          </div>
        </section>
      </main>
    )
  }

  if (activeModule && moduleCopy[activeModule]) {
    const copy = moduleCopy[activeModule]

    return (
      <main className={`party-screen party-screen--feature party-screen--feature-${activeModule}`}>
        <div className="party-screen__orb party-screen__orb--one" />
        <div className="party-screen__orb party-screen__orb--two" />

        <header className="party-screen__topline">
          <div>
            <span className="party-screen__live-dot" />
            À la une
          </div>
          <span>Anniv 2026</span>
        </header>

        <section className="party-screen__feature-promo">
          <div>
            <p className="party-screen__eyebrow">{copy.eyebrow}</p>
            <h1>{copy.title}</h1>
            <p>{copy.detail}</p>
          </div>
          <QrBlock label="Scanne pour participer" />
        </section>
      </main>
    )
  }

  return (
    <main className="party-screen party-screen--idle">
      <div className="party-screen__orb party-screen__orb--one" />
      <div className="party-screen__orb party-screen__orb--two" />

      <header className="party-screen__topline">
        <div>
          <span className="party-screen__live-dot" />
          {settings.phase === 'live' ? 'Soirée en cours' : 'Préparation'}
        </div>
        <span>Anniv 2026</span>
      </header>

      <section className="party-screen__idle-layout">
        <div className="party-screen__idle-copy">
          <p className="party-screen__eyebrow">Anniv 2026 · Live</p>
          <h1>Rejoins<br />la soirée.</h1>
          <p>
            Scanne le QR code pour accéder aux jeux,
            aux votes et au reste de la soirée.
          </p>
        </div>

        <QrBlock label="Scanne avec ton téléphone" large />
      </section>
    </main>
  )
}

function QrBlock({
  label,
  large = false,
}: {
  label: string
  large?: boolean
}) {
  return (
    <div
      className={
        large
          ? 'party-screen__qr party-screen__qr--large'
          : 'party-screen__qr'
      }
    >
      <div className="party-screen__qr-frame">
        <img
          src="/anniv-2026-qr.svg"
          alt="QR code pour rejoindre Anniv 2026"
        />
      </div>
      <strong>{label}</strong>
      <span>anniv-2026-pi.vercel.app</span>
    </div>
  )
}

export default PartyScreen
