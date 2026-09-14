import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import TournamentBracket from '../features/beer-pong/TournamentBracket'
import {
  getActiveRoundIndex,
  getChampionTeamId,
  normalizeTournamentRounds,
  type TournamentMatch,
  type TournamentTeam,
} from '../features/beer-pong/tournament'
import { useAuth } from '../features/auth/AuthContext'
import GuestAvatar from '../features/guests/GuestAvatar'
import { supabase } from '../lib/supabase'

import './BeerPongBracket.css'
import './BeerPongChampion.css'

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

export default function BeerPongBracketPage() {
  const { isAdmin, loading: authLoading } = useAuth()
  const [state, setState] = useState<State>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dismissedChampionId, setDismissedChampionId] = useState<string | null>(null)
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
  const championTeamId = state.championTeamId ?? getChampionTeamId(rounds)
  const championTeam = state.teams?.find((team) => team.id === championTeamId)
  const championPlayers = championTeam?.playerIds.map((playerId) => (
    state.playerSnapshots?.find((player) => player.id === playerId)
      ?? { id: playerId, name: 'Joueur' }
  )) ?? []
  const championModalOpen = Boolean(
    championTeamId
    && championTeam
    && dismissedChampionId !== championTeamId,
  )
  const completedMatches = useMemo(() => rounds.flat().filter(
    (match) => match.teamAId && match.teamBId && match.winnerTeamId,
  ).length, [rounds])
  const totalMatches = Math.max(0, (state.teams?.length ?? 0) - 1)

  useEffect(() => {
    if (!championModalOpen) return

    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && championTeamId) {
        setDismissedChampionId(championTeamId)
      }
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [championModalOpen, championTeamId])

  const pickWinner = async (
    roundIndex: number,
    _matchIndex: number,
    match: TournamentMatch,
    teamId: string,
  ) => {
    if (!isAdmin || busy || roundIndex > activeRoundIndex || match.winnerTeamId === teamId) return
    if (match.winnerTeamId || roundIndex < activeRoundIndex) {
      if (!window.confirm('Corriger ce résultat ? La branche concernée sera recalculée.')) return
    }

    setBusy(true)
    setError('')
    loadRequestRef.current += 1
    pendingWriteRef.current = true
    let shouldReload = false

    try {
      const { data, error: saveError } = await supabase.functions.invoke(
        'beer-pong-next-push',
        {
          body: {
            matchId: match.id,
            winnerTeamId: teamId,
          },
        },
      )

      if (saveError || !data?.ok || !data.state) {
        throw saveError ?? new Error(data?.error ?? 'INVALID_RESULT')
      }

      setState(parseState(data.state))

      if (data.delivery?.failed > 0) {
        setError('Résultat enregistré, mais une notification n’a pas pu être envoyée.')
      }
    } catch (saveError) {
      shouldReload = true
      console.error('[BeerPongBracket][SAVE_FAILED]', {
        roundIndex,
        matchId: match.id,
        expectedWinnerTeamId: teamId,
        error: saveError instanceof Error ? saveError.message : 'Unknown error',
      })
      setError('Le résultat n’a pas été enregistré. L’arbre a été resynchronisé.')
    } finally {
      pendingWriteRef.current = false
      if (deferredRefreshRef.current || shouldReload) {
        deferredRefreshRef.current = false
        await load()
      }
      setBusy(false)
    }
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

      {championModalOpen && championTeamId && (
        <div
          className="beer-bracket-champion"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setDismissedChampionId(championTeamId)
            }
          }}
        >
          <section
            className="beer-bracket-champion__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="beer-bracket-champion-title"
          >
            <button
              className="beer-bracket-champion__close"
              type="button"
              aria-label="Fermer"
              onClick={() => setDismissedChampionId(championTeamId)}
            >
              ×
            </button>

            <div className="beer-bracket-champion__trophy" aria-hidden="true">♛</div>
            <p className="beer-bracket-champion__eyebrow">Tournoi terminé</p>
            <h2 id="beer-bracket-champion-title">Champions du Beer Pong</h2>

            <div className="beer-bracket-champion__players">
              {championPlayers.map((player) => (
                <div className="beer-bracket-champion__player" key={player.id}>
                  <GuestAvatar
                    name={player.name}
                    path={player.avatarPath}
                    size="small"
                  />
                  <strong>{player.name}</strong>
                </div>
              ))}
            </div>

            <p className="beer-bracket-champion__message">
              Ils remportent le tournoi 2026.
            </p>
            <button
              className="beer-bracket-champion__action"
              type="button"
              onClick={() => setDismissedChampionId(championTeamId)}
            >
              Revoir l’arbre
            </button>
          </section>
        </div>
      )}
    </main>
  )
}
