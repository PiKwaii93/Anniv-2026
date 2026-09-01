import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { useParty } from '../features/party/PartyContext'
import { supabase } from '../lib/supabase'
import PhotoHuntScreen from './PhotoHuntScreen'

import './PartyScreen.css'
import './PartyScreenAuto.css'

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

type AutoSlide =
  | 'welcome'
  | 'pulse'
  | 'missions'
  | 'beer-pong'
  | 'photos'

const AUTO_SLIDE_DURATION = 12000

function PartyScreenAuto() {
  const { settings } = useParty()
  const [beerPongState, setBeerPongState] = useState<BeerPongState>({})
  const [missionScores, setMissionScores] = useState<MissionScoreRow[]>([])
  const [photoCount, setPhotoCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [slideIndex, setSlideIndex] = useState(0)
  const realtimeConnectedRef = useRef(false)

  const load = useCallback(async () => {
    const [beerPongResult, missionResult, photoResult] = await Promise.all([
      supabase
        .from('beer_pong_state')
        .select('state')
        .eq('id', 'main')
        .maybeSingle(),
      supabase
        .from('secret_mission_scoreboard')
        .select('player_id, completed_count'),
      supabase
        .from('photo_hunt_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved'),
    ])

    if (!beerPongResult.error) {
      const row = beerPongResult.data as BeerPongRow | null
      setBeerPongState(row?.state ?? {})
    } else {
      console.error('Unable to load automatic TV Beer Pong state:', beerPongResult.error)
    }

    if (!missionResult.error) {
      setMissionScores((missionResult.data ?? []) as MissionScoreRow[])
    } else {
      console.error('Unable to load automatic TV mission stats:', missionResult.error)
    }

    if (!photoResult.error) {
      setPhotoCount(photoResult.count ?? 0)
    } else {
      console.error('Unable to load automatic TV Photo Hunt count:', photoResult.error)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel('anniv-2026-party-screen-auto')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'beer_pong_state',
          filter: 'id=eq.main',
        },
        () => void load(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'secret_mission_scoreboard',
        },
        () => void load(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'photo_hunt_submissions',
        },
        () => void load(),
      )
      .subscribe((status) => {
        realtimeConnectedRef.current = status === 'SUBSCRIBED'
      })

    const fallback = window.setInterval(() => {
      if (!realtimeConnectedRef.current) void load()
    }, 30000)

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setSlideIndex(0)
        void load()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      realtimeConnectedRef.current = false
      window.clearInterval(fallback)
      document.removeEventListener('visibilitychange', handleVisibility)
      void supabase.removeChannel(channel)
    }
  }, [load])

  const missionCompleted = useMemo(
    () => missionScores.reduce(
      (total, player) => total + player.completed_count,
      0,
    ),
    [missionScores],
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
  const currentRound = rounds[Math.max(0, rounds.length - 1)] ?? []
  const nextMatch = currentRound.find(
    (match) => match.teamAId && match.teamBId && !match.winnerTeamId,
  )
  const teamCount = beerPongState.teams?.length ?? 0
  const selectedPlayerCount = beerPongState.selectedPlayerIds?.length ?? 0
  const hasBeerPongActivity = Boolean(
    beerPongState.championTeamId
    || beerPongState.draftValidated
    || teamCount > 0
    || selectedPlayerCount > 0,
  )

  const slides = useMemo<AutoSlide[]>(() => {
    const next: AutoSlide[] = ['welcome', 'pulse']

    if (settings.missionsVisible && missionScores.length > 0) {
      next.push('missions')
    }

    if (settings.beerPongVisible && hasBeerPongActivity) {
      next.push('beer-pong')
    }

    if (settings.photosVisible && photoCount > 0) {
      next.push('photos')
    }

    return next
  }, [
    hasBeerPongActivity,
    missionScores.length,
    photoCount,
    settings.beerPongVisible,
    settings.missionsVisible,
    settings.photosVisible,
  ])

  useEffect(() => {
    setSlideIndex((current) => current % Math.max(slides.length, 1))
  }, [slides.length])

  useEffect(() => {
    if (slides.length <= 1) return

    const interval = window.setInterval(() => {
      setSlideIndex((current) => (current + 1) % slides.length)
    }, AUTO_SLIDE_DURATION)

    return () => window.clearInterval(interval)
  }, [slides.length])

  const activeSlide = slides[slideIndex % slides.length] ?? 'welcome'

  if (loading) {
    return (
      <main className="party-screen party-screen--loading">
        <div className="party-screen__orb party-screen__orb--one" />
        <p>Préparation de l’écran live…</p>
      </main>
    )
  }

  const indicator = (
    <AutoIndicator
      key={`${activeSlide}-${slideIndex}`}
      current={slideIndex + 1}
      total={slides.length}
    />
  )

  if (activeSlide === 'photos') {
    return (
      <div className="party-screen-auto__photo-slide">
        <PhotoHuntScreen />
        {indicator}
      </div>
    )
  }

  if (activeSlide === 'missions') {
    return (
      <main className="party-screen party-screen--auto party-screen--auto-missions">
        <div className="party-screen__orb party-screen__orb--one" />
        <div className="party-screen__orb party-screen__orb--two" />
        <AutoTopline label="Missions secrètes" />

        <section className="party-screen-auto__split">
          <div>
            <p className="party-screen__eyebrow">Infiltration en cours</p>
            <h1>Quelqu’un<br />ici bluffe.</h1>
            <p className="party-screen-auto__lead">
              Les missions sont privées. Regarde autour de toi : quelqu’un est probablement en train d’essayer la sienne.
            </p>
          </div>

          <div className="party-screen-auto__big-stats">
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
        {indicator}
      </main>
    )
  }

  if (activeSlide === 'beer-pong') {
    const champion = teamName(beerPongState.championTeamId)

    return (
      <main className="party-screen party-screen--auto party-screen--auto-pong">
        <div className="party-screen__orb party-screen__orb--one" />
        <div className="party-screen__orb party-screen__orb--two" />
        <AutoTopline label="Beer Pong" />

        <section className="party-screen-auto__split">
          <div>
            <p className="party-screen__eyebrow">
              {beerPongState.championTeamId ? '🏆 Tournoi terminé' : 'Tournoi'}
            </p>
            <h1>
              {beerPongState.championTeamId
                ? 'Les champions.'
                : 'Ça chauffe.'}
            </h1>
            <p className="party-screen-auto__lead">
              {beerPongState.championTeamId
                ? champion
                : nextMatch
                  ? `${teamName(nextMatch.teamAId)} vs ${teamName(nextMatch.teamBId)}`
                  : beerPongState.draftValidated
                    ? 'Le tableau avance. Le prochain duel arrive.'
                    : `${selectedPlayerCount} joueur${selectedPlayerCount !== 1 ? 's' : ''} prêt${selectedPlayerCount !== 1 ? 's' : ''} pour le tournoi.`}
            </p>
          </div>

          <div className="party-screen-auto__big-stats">
            <div>
              <strong>{teamCount}</strong>
              <span>équipes</span>
            </div>
            <div>
              <strong>{rounds.length}</strong>
              <span>tours créés</span>
            </div>
          </div>
        </section>
        {indicator}
      </main>
    )
  }

  if (activeSlide === 'pulse') {
    const vibe = photoCount > 0
      ? 'Le mur se remplit. Continuez à capturer les bons moments.'
      : missionScores.length > 0
        ? 'Les agents sont dans la salle. Faites attention aux comportements suspects.'
        : hasBeerPongActivity
          ? 'Le tournoi se prépare. Gardez un œil sur le prochain duel.'
          : 'Scanne le QR et choisis ton prénom pour rejoindre la soirée.'

    return (
      <main className="party-screen party-screen--auto party-screen--auto-pulse">
        <div className="party-screen__orb party-screen__orb--one" />
        <div className="party-screen__orb party-screen__orb--two" />
        <AutoTopline label="La soirée en direct" />

        <section className="party-screen-auto__pulse">
          <div>
            <p className="party-screen__eyebrow">Anniv 2026 · maintenant</p>
            <h1>Ça vit.</h1>
            <p className="party-screen-auto__lead">{vibe}</p>
          </div>

          <div className="party-screen-auto__metric-grid">
            <article>
              <span>Agents</span>
              <strong>{missionScores.length}</strong>
              <small>{missionCompleted} missions réussies</small>
            </article>
            <article>
              <span>Beer Pong</span>
              <strong>{teamCount}</strong>
              <small>équipes dans le tableau</small>
            </article>
            <article>
              <span>Photo Hunt</span>
              <strong>{photoCount}</strong>
              <small>photos publiées</small>
            </article>
          </div>
        </section>
        {indicator}
      </main>
    )
  }

  return (
    <main className="party-screen party-screen--auto party-screen--auto-welcome">
      <div className="party-screen__orb party-screen__orb--one" />
      <div className="party-screen__orb party-screen__orb--two" />
      <AutoTopline label="Soirée en cours" />

      <section className="party-screen-auto__welcome">
        <div>
          <p className="party-screen__eyebrow">Anniv 2026 · Live</p>
          <h1>Rejoins<br />la soirée.</h1>
          <p className="party-screen-auto__lead">
            Scanne, choisis ton prénom et accède aux jeux, aux votes et aux défis de la soirée.
          </p>
        </div>

        <div className="party-screen-auto__qr">
          <div>
            <img
              src="/anniv-2026-qr.svg"
              alt="QR code pour rejoindre Anniv 2026"
            />
          </div>
          <strong>Scanne avec ton téléphone</strong>
          <span>anniv-2026-pi.vercel.app</span>
        </div>
      </section>
      {indicator}
    </main>
  )
}

function AutoTopline({ label }: { label: string }) {
  return (
    <header className="party-screen__topline">
      <div>
        <span className="party-screen__live-dot" />
        {label}
      </div>
      <span>Anniv 2026 · Auto</span>
    </header>
  )
}

function AutoIndicator({
  current,
  total,
}: {
  current: number
  total: number
}) {
  return (
    <div className="party-screen-auto__indicator" aria-label={`Écran automatique ${current} sur ${total}`}>
      <div>
        <span className="party-screen-auto__indicator-dot" />
        <strong>AUTO</strong>
        <small>{current}/{total}</small>
      </div>
      <i>
        <span />
      </i>
    </div>
  )
}

export default PartyScreenAuto
