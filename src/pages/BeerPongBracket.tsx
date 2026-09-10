import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import TournamentBracket from '../features/beer-pong/TournamentBracket'
import {
  getActiveRoundIndex,
  getChampionTeamId,
  normalizeTournamentRounds,
  updateTournamentWinnerAt,
  type TournamentMatch,
  type TournamentTeam,
} from '../features/beer-pong/tournament'
import { useAuth } from '../features/auth/AuthContext'
import { supabase } from '../lib/supabase'

import './BeerPongBracket.css'

type Player = { id: string; name: string; avatarPath?: string | null }
type State = {
  selectedPlayerIds?: string[]
  playerSnapshots?: Player[]
  teams?: TournamentTeam[]
  draftMode?: 'random' | 'manual'
  draftValidated?: boolean
  rounds?: TournamentMatch[][]
  championTeamId?: string | null
}

const emptyRounds: TournamentMatch[][] = []

function parseState(value: unknown): State {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const raw = value as Record<string, unknown>
  const teams = Array.isArray(raw.teams) ? raw.teams.filter((team): team is TournamentTeam => {
    if (!team || typeof team !== 'object' || Array.isArray(team)) return false
    const candidate = team as Record<string, unknown>
    return typeof candidate.id === 'string'
      && Array.isArray(candidate.playerIds)
      && candidate.playerIds.length === 2
      && candidate.playerIds.every((id) => typeof id === 'string')
  }) : []
  const playerSnapshots = Array.isArray(raw.playerSnapshots) ? raw.playerSnapshots.filter((player): player is Player => {
    if (!player || typeof player !== 'object' || Array.isArray(player)) return false
    const candidate = player as Record<string, unknown>
    return typeof candidate.id === 'string' && typeof candidate.name === 'string'
  }) : []
  const rounds = normalizeTournamentRounds(raw.rounds)
  return {
    ...raw,
    teams,
    playerSnapshots,
    draftValidated: raw.draftValidated === true,
    rounds,
    championTeamId: getChampionTeamId(rounds),
  } as State
}

function getStoredWinner(
  value: unknown,
  roundIndex: number,
  matchIndex: number,
) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const rawRounds = (value as Record<string, unknown>).rounds
  if (!Array.isArray(rawRounds)) return null
  const rawRound = rawRounds[roundIndex]
  if (!Array.isArray(rawRound)) return null
  const rawMatch = rawRound[matchIndex]
  if (!rawMatch || typeof rawMatch !== 'object' || Array.isArray(rawMatch)) return null
  const winner = (rawMatch as Record<string, unknown>).winnerTeamId
  return typeof winner === 'string' ? winner : null
}

function describeRound(value: unknown, roundIndex: number) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const rawRounds = (value as Record<string, unknown>).rounds
  if (!Array.isArray(rawRounds)) return []
  const rawRound = rawRounds[roundIndex]
  if (!Array.isArray(rawRound)) return []

  return rawRound.map((candidate, matchIndex) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return { matchIndex, invalid: true }
    }

    const match = candidate as Record<string, unknown>
    return {
      matchIndex,
      id: match.id ?? null,
      teamAId: match.teamAId ?? null,
      teamBId: match.teamBId ?? null,
      winnerTeamId: match.winnerTeamId ?? null,
      teamASourceMatchId: match.teamASourceMatchId ?? null,
      teamBSourceMatchId: match.teamBSourceMatchId ?? null,
    }
  })
}

export default function BeerPongBracketPage() {
  const { isAdmin, loading: authLoading } = useAuth()
  const [state, setState] = useState<State>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pendingWriteRef = useRef(false)
  const deferredRefreshRef = useRef(false)
  const loadRequestRef = useRef(0)

  const load = useCallback(async () => {
    if (pendingWriteRef.current) {
      deferredRefreshRef.current = true
      return
    }
    deferredRefreshRef.current = false

    const requestId = loadRequestRef.current + 1
    loadRequestRef.current = requestId

    const { data, error: loadError } = await supabase
      .from('beer_pong_state')
      .select('state')
      .eq('id', 'main')
      .maybeSingle()

    if (requestId !== loadRequestRef.current) return
    if (pendingWriteRef.current) {
      deferredRefreshRef.current = true
      return
    }

    if (loadError) setError('Impossible de synchroniser l’arbre du tournoi.')
    else {
      setState(parseState(data?.state))
      setError('')
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const channel = supabase.channel('anniv-2026-beer-pong-bracket')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'beer_pong_state', filter: 'id=eq.main' }, () => void load())
      .subscribe()
    const fallback = window.setInterval(() => void load(), 15000)
    return () => {
      window.clearInterval(fallback)
      void supabase.removeChannel(channel)
    }
  }, [load])

  const rounds = state.rounds ?? emptyRounds
  const activeRoundIndex = getActiveRoundIndex(rounds)
  const completedMatches = useMemo(() => rounds.flat().filter(
    (match) => match.teamAId && match.teamBId && match.winnerTeamId,
  ).length, [rounds])
  const totalMatches = Math.max(0, (state.teams?.length ?? 0) - 1)

  const pickWinner = async (
    roundIndex: number,
    matchIndex: number,
    match: TournamentMatch,
    teamId: string,
  ) => {
    if (!isAdmin || busy || roundIndex > activeRoundIndex || match.winnerTeamId === teamId) return
    if (match.winnerTeamId || roundIndex < activeRoundIndex) {
      if (!window.confirm('Corriger ce résultat ? La branche concernée sera recalculée.')) return
    }

    const nextRounds = updateTournamentWinnerAt(
      rounds,
      roundIndex,
      matchIndex,
      teamId,
    )
    const nextState = { ...state, rounds: nextRounds, championTeamId: getChampionTeamId(nextRounds) }
    setBusy(true)
    setState(nextState)
    setError('')
    loadRequestRef.current += 1
    pendingWriteRef.current = true

    const { data: savedRow, error: saveError } = await supabase
      .from('beer_pong_state')
      .upsert(
        { id: 'main', state: nextState },
        { onConflict: 'id' },
      )
      .select('state')
      .single()

    pendingWriteRef.current = false
    if (saveError || !savedRow) {
      console.error('[BeerPongBracket][SAVE_FAILED]', {
        roundIndex,
        matchIndex,
        matchId: match.id,
        expectedWinnerTeamId: teamId,
        error: saveError?.message ?? 'Supabase did not return the saved row',
      })
      await load()
      setError('Le résultat n’a pas été enregistré. L’arbre a été resynchronisé.')
    } else {
      const storedWinner = getStoredWinner(
        savedRow.state,
        roundIndex,
        matchIndex,
      )
      const savedState = parseState(savedRow.state)
      const savedWinner = savedState.rounds?.[roundIndex]?.[matchIndex]?.winnerTeamId

      if (storedWinner !== teamId) {
        console.error('[BeerPongBracket][STORAGE_MISMATCH]', {
          roundIndex,
          matchIndex,
          matchId: match.id,
          expectedWinnerTeamId: teamId,
          storedWinnerTeamId: storedWinner,
          storedPreviousRound: describeRound(savedRow.state, roundIndex - 1),
          storedRound: describeRound(savedRow.state, roundIndex),
          storedNextRound: describeRound(savedRow.state, roundIndex + 1),
        })
        await load()
        setError('Supabase n’a pas conservé ce résultat. L’arbre a été resynchronisé.')
        setBusy(false)
        return
      }

      if (savedWinner !== teamId) {
        deferredRefreshRef.current = false
        setState(nextState)
        console.error('[BeerPongBracket][REBUILD_MISMATCH]', {
          roundIndex,
          matchIndex,
          matchId: match.id,
          expectedWinnerTeamId: teamId,
          storedWinnerTeamId: storedWinner,
          rebuiltWinnerTeamId: savedWinner ?? null,
          storedPreviousRound: describeRound(savedRow.state, roundIndex - 1),
          storedRound: describeRound(savedRow.state, roundIndex),
          storedNextRound: describeRound(savedRow.state, roundIndex + 1),
          rebuiltPreviousRound: savedState.rounds?.[roundIndex - 1] ?? [],
          rebuiltRound: savedState.rounds?.[roundIndex] ?? [],
          rebuiltNextRound: savedState.rounds?.[roundIndex + 1] ?? [],
        })
        setError('Le résultat est enregistré, mais la reconstruction de l’arbre a échoué (diagnostic BP-REBUILD).')
        setBusy(false)
        return
      }

      setState(savedState)
    }

    if (!saveError && savedRow && deferredRefreshRef.current) {
      deferredRefreshRef.current = false
      await load()
    }
    setBusy(false)
  }

  return (
    <main className="beer-bracket-page">
      <header className="beer-bracket-page__header">
        <div>
          <Link to="/beer-pong">← Tournoi</Link>
          <p>Anniv 2026 / Beer Pong</p>
          <h1>L’arbre <span>complet.</span></h1>
        </div>
        <div className="beer-bracket-page__status">
          <strong>{completedMatches}<span>/{totalMatches}</span></strong>
          <small>matchs joués</small>
        </div>
      </header>

      {error && <p className="beer-bracket-page__error" role="alert">{error}</p>}
      {(loading || authLoading) && <p className="beer-bracket-page__empty">Chargement de l’arbre…</p>}
      {!loading && !state.draftValidated && <p className="beer-bracket-page__empty">L’arbre apparaîtra dès que la draft sera validée.</p>}
      {!loading && state.draftValidated && rounds.length > 0 && (
        <>
          <div className="beer-bracket-page__guide">
            <span>Glisse horizontalement pour parcourir les tours.</span>
            {isAdmin && <strong>{busy ? 'Enregistrement…' : 'Touche une équipe pour valider sa victoire.'}</strong>}
          </div>
          <TournamentBracket
            rounds={rounds}
            teams={state.teams ?? []}
            players={state.playerSnapshots ?? []}
            activeRoundIndex={activeRoundIndex}
            onPickWinner={isAdmin ? pickWinner : undefined}
          />
        </>
      )}
    </main>
  )
}
