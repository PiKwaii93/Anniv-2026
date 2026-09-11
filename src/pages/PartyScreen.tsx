import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  type PartyModule,
  useParty,
} from '../features/party/PartyContext'
import { supabase } from '../lib/supabase'
import { useNow } from '../hooks/useNow'
import PhotoHuntScreen from './PhotoHuntScreen'
import TournamentBracket from '../features/beer-pong/TournamentBracket'
import GuestAvatar from '../features/guests/GuestAvatar'
import {
  getActiveRoundIndex,
  getChampionTeamId,
  normalizeTournamentRounds,
} from '../features/beer-pong/tournament'

import './PartyScreen.css'

const BEER_PONG_TREE_DISPLAY_MS = 30_000
const BEER_PONG_TREE_SCROLL_DELAY_MS = 2_000
const BEER_PONG_TREE_MAX_SCROLL_MS = 22_000
const BEER_PONG_TREE_MIN_SCROLL_MS = 8_000
const BEER_PONG_TREE_SCROLL_SPEED = 32
const TV_ROTATION_MS = 12_000
const TV_ROOM_POLL_MS = 1500
const BINGO_PROMPTS_PER_PAGE = 6
const GUESTS_PER_PAGE = 12

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
  avatarPath?: string | null
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
  teamASourceMatchId?: string | null
  teamBSourceMatchId?: string | null
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

type BingoPromptRow = {
  id: string
  text: string
}

type IcebergEntryRow = {
  id: string
  level: number
  title: string
  description: string
  sort_order: number
}

type ScreenGuestRow = {
  id: string
  name: string
  avatar_path: string | null
  status: string
}

type ScreenPlusOneRow = {
  id: string
  guest_id: string
  name: string
  avatar_path: string | null
}

type ScreenPerson = {
  id: string
  name: string
  avatarPath: string | null
  detail: string
}

const icebergLevelCopy: Record<number, { number: string; title: string; subtitle: string }> = {
  1: { number: '01', title: 'Surface', subtitle: 'Les histoires que tout le monde connaît.' },
  2: { number: '02', title: 'Sous la surface', subtitle: 'Il faut déjà avoir été là quelques fois.' },
  3: { number: '03', title: 'Profondeurs', subtitle: 'Les dossiers commencent à ressortir.' },
  4: { number: '04', title: 'Abysses', subtitle: 'On entre dans les archives sensibles.' },
  5: { number: '05', title: "Fond de l’iceberg", subtitle: 'Si tu comprends tout, tu en sais trop.' },
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
  const [beerPongView, setBeerPongView] = useState<'match' | 'tree'>('match')
  const beerPongTreeRef = useRef<HTMLDivElement>(null)
  const [missionScores, setMissionScores] = useState<MissionScoreRow[]>([])
  const [bingoPrompts, setBingoPrompts] = useState<BingoPromptRow[]>([])
  const [bingoPage, setBingoPage] = useState(0)
  const [icebergEntries, setIcebergEntries] = useState<IcebergEntryRow[]>([])
  const [icebergLevelIndex, setIcebergLevelIndex] = useState(0)
  const [screenGuests, setScreenGuests] = useState<ScreenGuestRow[]>([])
  const [screenPlusOnes, setScreenPlusOnes] = useState<ScreenPlusOneRow[]>([])
  const [guestPage, setGuestPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const realtimeConnectedRef = useRef(false)

  const loadRoomState = useCallback(async () => {
    const { data, error } = await supabase
      .from('live_vote_public_state')
      .select('state')
      .eq('id', 'main')
      .maybeSingle()

    if (error) {
      console.error('Unable to load TV room state:', error)
      return
    }

    const row = data as RoomStateRow | null
    setRoomState(row?.state ?? { phase: 'idle' })
  }, [])

  const loadScreenData = useCallback(async () => {
    const [
      roomResult,
      beerPongResult,
      missionResult,
      bingoResult,
      icebergResult,
      guestResult,
      plusOneResult,
    ] = await Promise.all([
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
      supabase
        .from('bingo_prompts')
        .select('id, text')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('iceberg_entries')
        .select('id, level, title, description, sort_order')
        .eq('is_published', true)
        .order('level', { ascending: true })
        .order('sort_order', { ascending: true }),
      supabase
        .from('guests')
        .select('id, name, avatar_path, status')
        .eq('status', 'confirmed')
        .order('name', { ascending: true }),
      supabase
        .from('plus_ones')
        .select('id, guest_id, name, avatar_path')
        .order('name', { ascending: true }),
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

    if (!bingoResult.error) {
      setBingoPrompts((bingoResult.data ?? []) as BingoPromptRow[])
    } else {
      console.error('Unable to load TV Bingo prompts:', bingoResult.error)
    }

    if (!icebergResult.error) {
      setIcebergEntries((icebergResult.data ?? []) as IcebergEntryRow[])
    } else {
      console.error('Unable to load TV Iceberg entries:', icebergResult.error)
    }

    if (!guestResult.error) {
      setScreenGuests((guestResult.data ?? []) as ScreenGuestRow[])
    } else {
      console.error('Unable to load TV guests:', guestResult.error)
    }

    if (!plusOneResult.error) {
      setScreenPlusOnes((plusOneResult.data ?? []) as ScreenPlusOneRow[])
    } else {
      console.error('Unable to load TV plus-ones:', plusOneResult.error)
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
        () => void loadRoomState(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bingo_prompts' },
        () => void loadScreenData(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'iceberg_entries' },
        () => void loadScreenData(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'guests' },
        () => void loadScreenData(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'plus_ones' },
        () => void loadScreenData(),
      )
      .subscribe((status) => {
        realtimeConnectedRef.current = status === 'SUBSCRIBED'
      })

    const fallback = window.setInterval(
      () => {
        if (!realtimeConnectedRef.current && document.visibilityState === 'visible') {
          void loadScreenData()
        }
      },
      30000,
    )

    const roomPoll = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadRoomState()
    }, TV_ROOM_POLL_MS)

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void loadScreenData()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      realtimeConnectedRef.current = false
      window.clearInterval(fallback)
      window.clearInterval(roomPoll)
      document.removeEventListener('visibilitychange', handleVisibility)
      void supabase.removeChannel(channel)
    }
  }, [loadRoomState, loadScreenData])

  const now = useNow(
    roomState.phase === 'open' && Boolean(roomState.closesAt),
  )

  const secondsLeft = roomState.closesAt && now !== null
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

  const rounds = normalizeTournamentRounds(beerPongState.rounds)
  const beerPongChampionTeamId = getChampionTeamId(rounds)
  const currentRoundIndex = getActiveRoundIndex(rounds)
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

  const bingoPageCount = Math.max(
    1,
    Math.ceil(bingoPrompts.length / BINGO_PROMPTS_PER_PAGE),
  )
  const visibleBingoPrompts = useMemo(() => {
    if (bingoPrompts.length <= BINGO_PROMPTS_PER_PAGE) return bingoPrompts
    const start = (bingoPage % bingoPageCount) * BINGO_PROMPTS_PER_PAGE
    return bingoPrompts.slice(start, start + BINGO_PROMPTS_PER_PAGE)
  }, [bingoPage, bingoPageCount, bingoPrompts])

  const icebergLevels = useMemo(
    () => [...new Set(icebergEntries.map((entry) => entry.level))]
      .filter((level) => icebergLevelCopy[level])
      .sort((a, b) => a - b),
    [icebergEntries],
  )
  const currentIcebergLevel = icebergLevels.length > 0
    ? icebergLevels[icebergLevelIndex % icebergLevels.length]
    : null
  const visibleIcebergEntries = currentIcebergLevel === null
    ? []
    : icebergEntries
      .filter((entry) => entry.level === currentIcebergLevel)
      .slice(0, 5)

  const guestPeople = useMemo<ScreenPerson[]>(() => {
    const confirmedGuestIds = new Set(screenGuests.map((guest) => guest.id))
    return [
      ...screenGuests.map((guest) => ({
        id: `guest:${guest.id}`,
        name: guest.name,
        avatarPath: guest.avatar_path,
        detail: 'Invité·e',
      })),
      ...screenPlusOnes
        .filter((plusOne) => confirmedGuestIds.has(plusOne.guest_id))
        .map((plusOne) => ({
          id: `plus-one:${plusOne.id}`,
          name: plusOne.name,
          avatarPath: plusOne.avatar_path,
          detail: '+1',
        })),
    ]
  }, [screenGuests, screenPlusOnes])
  const guestPageCount = Math.max(1, Math.ceil(guestPeople.length / GUESTS_PER_PAGE))
  const visibleGuestPeople = useMemo(() => {
    if (guestPeople.length <= GUESTS_PER_PAGE) return guestPeople
    const start = (guestPage % guestPageCount) * GUESTS_PER_PAGE
    return guestPeople.slice(start, start + GUESTS_PER_PAGE)
  }, [guestPage, guestPageCount, guestPeople])

  useEffect(() => {
    if (activeModule !== 'bingo' || bingoPageCount <= 1) return
    const interval = window.setInterval(
      () => setBingoPage((current) => (current + 1) % bingoPageCount),
      TV_ROTATION_MS,
    )
    return () => window.clearInterval(interval)
  }, [activeModule, bingoPageCount])

  useEffect(() => {
    if (activeModule !== 'iceberg' || icebergLevels.length <= 1) return
    const interval = window.setInterval(
      () => setIcebergLevelIndex((current) => (current + 1) % icebergLevels.length),
      TV_ROTATION_MS,
    )
    return () => window.clearInterval(interval)
  }, [activeModule, icebergLevels.length])

  useEffect(() => {
    if (activeModule !== 'guests' || guestPageCount <= 1) return
    const interval = window.setInterval(
      () => setGuestPage((current) => (current + 1) % guestPageCount),
      TV_ROTATION_MS,
    )
    return () => window.clearInterval(interval)
  }, [activeModule, guestPageCount])

  useEffect(() => {
    if (
      activeModule !== 'beer-pong'
      || !beerPongState.draftValidated
      || beerPongChampionTeamId
      || rounds.length === 0
    ) return

    const timeout = window.setTimeout(
      () => setBeerPongView((current) => current === 'match' ? 'tree' : 'match'),
      beerPongView === 'match' ? 12_000 : BEER_PONG_TREE_DISPLAY_MS,
    )
    return () => window.clearTimeout(timeout)
  }, [activeModule, beerPongChampionTeamId, beerPongState.draftValidated, beerPongView, rounds.length])

  useEffect(() => {
    if (
      activeModule !== 'beer-pong'
      || beerPongView !== 'tree'
      || !beerPongState.draftValidated
      || beerPongChampionTeamId
    ) return

    const tree = beerPongTreeRef.current
    if (!tree) return

    tree.scrollTop = 0

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let animationFrame = 0
    const startTimer = window.setTimeout(() => {
      const maximumScroll = tree.scrollHeight - tree.clientHeight
      if (maximumScroll <= 0) return

      const duration = Math.min(
        BEER_PONG_TREE_MAX_SCROLL_MS,
        Math.max(
          BEER_PONG_TREE_MIN_SCROLL_MS,
          (maximumScroll / BEER_PONG_TREE_SCROLL_SPEED) * 1_000,
        ),
      )
      const startedAt = window.performance.now()

      const scroll = (timestamp: number) => {
        const progress = Math.min(1, (timestamp - startedAt) / duration)
        const easedProgress = progress < 0.5
          ? 2 * progress * progress
          : 1 - ((-2 * progress + 2) ** 2) / 2

        tree.scrollTop = maximumScroll * easedProgress
        if (progress < 1) animationFrame = window.requestAnimationFrame(scroll)
      }

      animationFrame = window.requestAnimationFrame(scroll)
    }, BEER_PONG_TREE_SCROLL_DELAY_MS)

    return () => {
      window.clearTimeout(startTimer)
      window.cancelAnimationFrame(animationFrame)
    }
  }, [activeModule, beerPongChampionTeamId, beerPongState.draftValidated, beerPongView, rounds.length])

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
    const championName = teamName(beerPongChampionTeamId)

    if (beerPongState.draftValidated && !beerPongChampionTeamId && beerPongView === 'tree') {
      return (
        <main className="party-screen party-screen--pong-tree">
          <header className="party-screen__topline">
            <div><span className="party-screen__live-dot" />Beer Pong · arbre complet</div>
            <span>Défilement automatique · prochain match ensuite</span>
          </header>
          <TournamentBracket
            scrollRef={beerPongTreeRef}
            rounds={rounds}
            teams={beerPongState.teams ?? []}
            players={beerPongState.playerSnapshots ?? []}
            activeRoundIndex={currentRoundIndex}
            variant="tv"
          />
        </main>
      )
    }

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

        {beerPongChampionTeamId ? (
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

  if (activeModule === 'bingo') {
    return (
      <main className="party-screen party-screen--bingo-live">
        <div className="party-screen__orb party-screen__orb--one" />
        <div className="party-screen__orb party-screen__orb--two" />

        <header className="party-screen__topline">
          <div><span className="party-screen__live-dot" />Bingo · à observer ce soir</div>
          <span>{bingoPrompts.length} situations dans le pool</span>
        </header>

        <section className="party-screen__bingo-layout">
          <div className="party-screen__bingo-heading">
            <p className="party-screen__eyebrow">Chaque grille est unique</p>
            <h1>Bingo</h1>
            <p>Coche ce que tu vois. Une ligne suffit pour gagner.</p>
            <QrBlock label="Ouvre ta grille" compact />
          </div>

          {visibleBingoPrompts.length > 0 ? (
            <div className="party-screen__bingo-board" key={bingoPage}>
              {visibleBingoPrompts.map((prompt, index) => (
                <article key={prompt.id}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{prompt.text}</strong>
                </article>
              ))}
              <p>{bingoPageCount > 1 ? `${(bingoPage % bingoPageCount) + 1}/${bingoPageCount}` : 'En direct'}</p>
            </div>
          ) : (
            <div className="party-screen__feature-empty">
              <strong>Les cases arrivent.</strong>
              <span>Prépare ton téléphone pour générer ta grille.</span>
            </div>
          )}
        </section>
      </main>
    )
  }

  if (activeModule === 'iceberg') {
    const level = currentIcebergLevel === null ? null : icebergLevelCopy[currentIcebergLevel]

    return (
      <main className="party-screen party-screen--iceberg-live">
        <div className="party-screen__orb party-screen__orb--one" />
        <div className="party-screen__orb party-screen__orb--two" />

        <header className="party-screen__topline">
          <div><span className="party-screen__live-dot" />Iceberg · archives ouvertes</div>
          <span>{icebergEntries.length} dossiers publiés</span>
        </header>

        {level ? (
          <section className="party-screen__iceberg-layout" key={currentIcebergLevel}>
            <div className="party-screen__iceberg-heading">
              <p className="party-screen__eyebrow">Niveau {level.number}</p>
              <h1>{level.title}</h1>
              <p>{level.subtitle}</p>
              <div className="party-screen__iceberg-depth" aria-label={`Niveau ${level.number} sur 05`}>
                {Object.keys(icebergLevelCopy).map((key) => (
                  <i key={key} className={Number(key) <= (currentIcebergLevel ?? 0) ? 'is-reached' : ''} />
                ))}
              </div>
              <QrBlock label="Explorer tout l’iceberg" compact />
            </div>

            <div className="party-screen__iceberg-cards">
              {visibleIcebergEntries.map((entry, index) => (
                <article key={entry.id} className={index === 0 ? 'is-featured' : ''}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{entry.title}</strong>
                  {entry.description && <p>{entry.description}</p>}
                </article>
              ))}
            </div>
          </section>
        ) : (
          <section className="party-screen__feature-promo">
            <div>
              <p className="party-screen__eyebrow">Archives</p>
              <h1>Iceberg</h1>
              <p>Les premiers dossiers seront bientôt publiés.</p>
            </div>
            <QrBlock label="Explorer l’iceberg" />
          </section>
        )}
      </main>
    )
  }

  if (activeModule === 'guests') {
    return (
      <main className="party-screen party-screen--guests-live">
        <div className="party-screen__orb party-screen__orb--one" />
        <div className="party-screen__orb party-screen__orb--two" />

        <header className="party-screen__topline">
          <div><span className="party-screen__live-dot" />La bande · Anniv 2026</div>
          <span>{guestPeople.length} personne{guestPeople.length !== 1 ? 's' : ''} confirmée{guestPeople.length !== 1 ? 's' : ''}</span>
        </header>

        <section className="party-screen__guests-layout">
          <div className="party-screen__guests-heading">
            <p className="party-screen__eyebrow">Ce soir</p>
            <h1>La<br />bande.</h1>
            <p>Des visages connus, des +1 et quelques dossiers à créer.</p>
            <QrBlock label="Voir toute la liste" compact />
          </div>

          {visibleGuestPeople.length > 0 ? (
            <div className="party-screen__guest-grid" key={guestPage}>
              {visibleGuestPeople.map((person) => (
                <article key={person.id}>
                  <GuestAvatar
                    name={person.name}
                    path={person.avatarPath}
                    size="large"
                  />
                  <strong>{person.name}</strong>
                  <span>{person.detail}</span>
                </article>
              ))}
              <p>{guestPageCount > 1 ? `${(guestPage % guestPageCount) + 1}/${guestPageCount}` : 'Tout le monde est là'}</p>
            </div>
          ) : (
            <div className="party-screen__feature-empty">
              <strong>La bande se prépare.</strong>
              <span>Les personnes confirmées apparaîtront ici.</span>
            </div>
          )}
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
  compact = false,
}: {
  label: string
  large?: boolean
  compact?: boolean
}) {
  return (
    <div
      className={`party-screen__qr${large ? ' party-screen__qr--large' : ''}${compact ? ' party-screen__qr--compact' : ''}`}
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
