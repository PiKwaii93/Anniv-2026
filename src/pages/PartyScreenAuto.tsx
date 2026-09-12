import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useParty } from '../features/party/PartyContext'
import {
  getActiveRoundIndex,
  normalizeTournamentRounds,
} from '../features/beer-pong/tournament'
import { supabase } from '../lib/supabase'
import PartyScreen from './PartyScreen'
import PhotoHuntScreen from './PhotoHuntScreen'

import './PartyScreen.css'
import './PartyScreenAuto.css'

type PlayerSnapshot = { id: string; name: string }
type Team = { id: string; playerIds: [string, string] }
type Match = {
  id: string
  teamAId: string | null
  teamBId: string | null
  winnerTeamId: string | null
}
type BeerPongState = {
  playerSnapshots?: PlayerSnapshot[]
  teams?: Team[]
  rounds?: Match[][]
}
type MissionScoreRow = { player_id: string; completed_count: number }
type IcebergEntryRow = {
  id: string
  level: number
  title: string
  description: string
  sort_order: number
}
type AmbientInsert =
  | { kind: 'missions'; completed: number; agents: number }
  | { kind: 'beer-pong'; match: Match }
  | { kind: 'iceberg'; level: number; entries: IcebergEntryRow[] }

const PHOTO_MINIMUM_DWELL_MS = 90_000
const MISSION_INSERT_MS = 11_000
const PONG_INSERT_MS = 12_000
const ICEBERG_INSERT_MS = 17_000
const ICEBERG_COOLDOWN_MS = 9 * 60_000
const AMBIENT_POLL_MS = 10_000
const DIRECTOR_TICK_MS = 5_000

function PartyScreenAuto({ paused = false }: { paused?: boolean }) {
  const { settings } = useParty()
  const [beerPongState, setBeerPongState] = useState<BeerPongState>({})
  const [missionScores, setMissionScores] = useState<MissionScoreRow[]>([])
  const [icebergEntries, setIcebergEntries] = useState<IcebergEntryRow[]>([])
  const [insert, setInsert] = useState<AmbientInsert | null>(null)
  const [initialDataLoaded, setInitialDataLoaded] = useState(false)
  const baselineReadyRef = useRef(false)
  const wasPausedRef = useRef(paused)
  const lastMissionTotalRef = useRef(0)
  const lastMatchIdRef = useRef<string | null>(null)
  const photoDwellStartedAtRef = useRef(Date.now())
  const lastIcebergAtRef = useRef(0)
  const icebergLevelRef = useRef(0)

  const load = useCallback(async () => {
    const [beerPongResult, missionResult, icebergResult] = await Promise.all([
      supabase.from('beer_pong_state').select('state').eq('id', 'main').maybeSingle(),
      supabase.from('secret_mission_scoreboard').select('player_id, completed_count'),
      supabase
        .from('iceberg_entries')
        .select('id, level, title, description, sort_order')
        .eq('is_published', true)
        .order('level', { ascending: true })
        .order('sort_order', { ascending: true }),
    ])

    if (!beerPongResult.error) {
      const row = beerPongResult.data as { state: BeerPongState | null } | null
      setBeerPongState(row?.state ?? {})
    } else {
      console.error('[ScreenDirector][AMBIENT_PONG_LOAD_ERROR]', beerPongResult.error)
    }

    if (!missionResult.error) {
      setMissionScores((missionResult.data ?? []) as MissionScoreRow[])
    } else {
      console.error('[ScreenDirector][AMBIENT_MISSIONS_LOAD_ERROR]', missionResult.error)
    }

    if (!icebergResult.error) {
      setIcebergEntries((icebergResult.data ?? []) as IcebergEntryRow[])
    } else {
      console.error('[ScreenDirector][AMBIENT_ICEBERG_LOAD_ERROR]', icebergResult.error)
    }

    setInitialDataLoaded(true)
  }, [])

  useEffect(() => {
    void load()
    const channel = supabase
      .channel('anniv-2026-party-screen-ambient')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'beer_pong_state', filter: 'id=eq.main',
      }, () => void load())
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'secret_mission_scoreboard',
      }, () => void load())
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'iceberg_entries',
      }, () => void load())
      .subscribe()
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, AMBIENT_POLL_MS)

    return () => {
      window.clearInterval(poll)
      void supabase.removeChannel(channel)
    }
  }, [load])

  const missionCompleted = useMemo(
    () => missionScores.reduce((total, player) => total + player.completed_count, 0),
    [missionScores],
  )
  const rounds = useMemo(
    () => normalizeTournamentRounds(beerPongState.rounds),
    [beerPongState.rounds],
  )
  const activeRoundIndex = getActiveRoundIndex(rounds)
  const nextMatch = (rounds[activeRoundIndex] ?? []).find(
    (match) => match.teamAId && match.teamBId && !match.winnerTeamId,
  ) ?? null

  useEffect(() => {
    if (!initialDataLoaded || baselineReadyRef.current) return
    lastMissionTotalRef.current = missionCompleted
    lastMatchIdRef.current = nextMatch?.id ?? null
    baselineReadyRef.current = true
  }, [initialDataLoaded, missionCompleted, nextMatch?.id])

  useEffect(() => {
    if (paused) {
      lastMissionTotalRef.current = missionCompleted
      lastMatchIdRef.current = nextMatch?.id ?? null
    } else if (wasPausedRef.current) {
      photoDwellStartedAtRef.current = Date.now()
    }
    wasPausedRef.current = paused
  }, [missionCompleted, nextMatch?.id, paused])

  useEffect(() => {
    if (paused || !insert) return
    const duration = insert.kind === 'iceberg'
      ? ICEBERG_INSERT_MS
      : insert.kind === 'beer-pong'
        ? PONG_INSERT_MS
        : MISSION_INSERT_MS
    const timeout = window.setTimeout(() => {
      setInsert(null)
      photoDwellStartedAtRef.current = Date.now()
    }, duration)
    return () => window.clearTimeout(timeout)
  }, [insert, paused])

  useEffect(() => {
    if (paused) return
    const tick = () => {
      if (
        insert
        || !baselineReadyRef.current
        || Date.now() - photoDwellStartedAtRef.current < PHOTO_MINIMUM_DWELL_MS
      ) return

      if (
        settings.missionsVisible
        && missionCompleted > lastMissionTotalRef.current
      ) {
        lastMissionTotalRef.current = missionCompleted
        setInsert({ kind: 'missions', completed: missionCompleted, agents: missionScores.length })
        return
      }

      if (
        settings.beerPongVisible
        && nextMatch
        && nextMatch.id !== lastMatchIdRef.current
      ) {
        lastMatchIdRef.current = nextMatch.id
        setInsert({ kind: 'beer-pong', match: nextMatch })
        return
      }

      if (
        settings.icebergVisible
        && icebergEntries.length > 0
        && Date.now() - lastIcebergAtRef.current >= ICEBERG_COOLDOWN_MS
      ) {
        const levels = [...new Set(icebergEntries.map((entry) => entry.level))]
          .sort((a, b) => a - b)
        const level = levels[icebergLevelRef.current % levels.length]
        const entries = icebergEntries.filter((entry) => entry.level === level).slice(0, 3)
        icebergLevelRef.current += 1
        lastIcebergAtRef.current = Date.now()
        setInsert({ kind: 'iceberg', level, entries })
      }
    }

    const interval = window.setInterval(tick, DIRECTOR_TICK_MS)
    return () => window.clearInterval(interval)
  }, [
    icebergEntries,
    insert,
    missionCompleted,
    missionScores.length,
    nextMatch,
    paused,
    settings.beerPongVisible,
    settings.icebergVisible,
    settings.missionsVisible,
  ])

  const playerById = useMemo(
    () => new Map((beerPongState.playerSnapshots ?? []).map((player) => [player.id, player])),
    [beerPongState.playerSnapshots],
  )
  const teamById = useMemo(
    () => new Map((beerPongState.teams ?? []).map((team) => [team.id, team])),
    [beerPongState.teams],
  )
  const teamName = useCallback((teamId: string | null) => {
    const team = teamId ? teamById.get(teamId) : null
    if (!team) return 'Équipe'
    return team.playerIds.map((id) => playerById.get(id)?.name ?? 'Joueur').join(' & ')
  }, [playerById, teamById])

  return (
    <div className="party-screen-auto-smart">
      {settings.photosVisible
        ? <PhotoHuntScreen paused={paused || Boolean(insert)} />
        : <PartyScreen />}

      {insert?.kind === 'missions' && (
        <main className="party-screen party-screen--auto party-screen--auto-missions party-screen-auto-smart__insert">
          <header className="party-screen__topline">
            <div><span className="party-screen__live-dot" />Missions secrètes</div>
            <span>Progression détectée</span>
          </header>
          <section className="party-screen-auto__split">
            <div>
              <p className="party-screen__eyebrow">Infiltration en cours</p>
              <h1>Ça<br />avance.</h1>
              <p className="party-screen-auto__lead">Une nouvelle mission vient d’être validée.</p>
            </div>
            <div className="party-screen-auto__big-stats">
              <div><strong>{insert.agents}</strong><span>agents actifs</span></div>
              <div><strong>{insert.completed}</strong><span>missions réussies</span></div>
            </div>
          </section>
        </main>
      )}

      {insert?.kind === 'beer-pong' && (
        <main className="party-screen party-screen--auto party-screen--auto-pong party-screen-auto-smart__insert">
          <header className="party-screen__topline">
            <div><span className="party-screen__live-dot" />Beer Pong</div>
            <span>Prochain duel</span>
          </header>
          <section className="party-screen-auto-smart__match">
            <p className="party-screen__eyebrow">À vos gobelets</p>
            <strong>{teamName(insert.match.teamAId)}</strong>
            <b>VS</b>
            <strong>{teamName(insert.match.teamBId)}</strong>
          </section>
        </main>
      )}

      {insert?.kind === 'iceberg' && (
        <main className="party-screen party-screen--iceberg-live party-screen-auto-smart__insert">
          <header className="party-screen__topline">
            <div><span className="party-screen__live-dot" />Iceberg · archives ouvertes</div>
            <span>Niveau {String(insert.level).padStart(2, '0')}</span>
          </header>
          <section className="party-screen-auto-smart__iceberg">
            <div>
              <p className="party-screen__eyebrow">Une plongée rapide</p>
              <h1>Sous la<br />surface.</h1>
            </div>
            <div>
              {insert.entries.map((entry) => (
                <article key={entry.id}>
                  <strong>{entry.title}</strong>
                  {entry.description && <p>{entry.description}</p>}
                </article>
              ))}
            </div>
          </section>
        </main>
      )}
    </div>
  )
}

export default PartyScreenAuto
