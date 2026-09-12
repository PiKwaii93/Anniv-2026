import { useCallback, useEffect, useMemo, useState } from 'react'

import { supabase } from '../../lib/supabase'

import './ScreenEventOverlay.css'

export type ScreenEvent = {
  id: string
  event_type: 'beer_pong_match_completed' | 'bingo_full_house'
  payload: Record<string, unknown>
  created_at: string
  expires_at: string
}

type PlayerSnapshot = {
  id: string
  name: string
}

type Team = {
  id: string
  playerIds: [string, string]
}

type BeerPongState = {
  playerSnapshots?: PlayerSnapshot[]
  teams?: Team[]
}

function payloadText(payload: Record<string, unknown>, key: string) {
  const value = payload[key]
  return typeof value === 'string' ? value : null
}

function ScreenEventOverlay({
  event,
  onComplete,
}: {
  event: ScreenEvent
  onComplete: () => void
}) {
  const [beerPongState, setBeerPongState] = useState<BeerPongState>({})
  const [beerPongPhase, setBeerPongPhase] = useState<'result' | 'next'>('result')
  const hasNextMatch = Boolean(
    payloadText(event.payload, 'nextTeamAId')
    && payloadText(event.payload, 'nextTeamBId'),
  )

  const loadBeerPong = useCallback(async () => {
    if (event.event_type !== 'beer_pong_match_completed') return

    const { data, error } = await supabase
      .from('beer_pong_state')
      .select('state')
      .eq('id', 'main')
      .maybeSingle()

    if (error) {
      console.error('[ScreenDirector][BEER_PONG_EVENT_LOAD_ERROR]', error)
      return
    }

    const row = data as { state: BeerPongState | null } | null
    setBeerPongState(row?.state ?? {})
  }, [event.event_type])

  useEffect(() => {
    setBeerPongPhase('result')
    void loadBeerPong()
  }, [event.id, loadBeerPong])

  useEffect(() => {
    if (event.event_type === 'bingo_full_house') {
      const timeout = window.setTimeout(onComplete, 9_000)
      return () => window.clearTimeout(timeout)
    }

    const resultTimeout = window.setTimeout(() => {
      if (hasNextMatch) setBeerPongPhase('next')
      else onComplete()
    }, hasNextMatch ? 5_500 : 10_000)
    const completeTimeout = hasNextMatch
      ? window.setTimeout(onComplete, 13_000)
      : null

    return () => {
      window.clearTimeout(resultTimeout)
      if (completeTimeout !== null) window.clearTimeout(completeTimeout)
    }
  }, [event.event_type, hasNextMatch, onComplete])

  const playerById = useMemo(
    () => new Map((beerPongState.playerSnapshots ?? []).map((player) => [player.id, player])),
    [beerPongState.playerSnapshots],
  )
  const teamById = useMemo(
    () => new Map((beerPongState.teams ?? []).map((team) => [team.id, team])),
    [beerPongState.teams],
  )
  const teamName = useCallback((teamId: string | null) => {
    if (!teamId) return 'Équipe'
    const team = teamById.get(teamId)
    if (!team) return 'Équipe'
    return team.playerIds
      .map((playerId) => playerById.get(playerId)?.name ?? 'Joueur')
      .join(' & ')
  }, [playerById, teamById])

  if (event.event_type === 'bingo_full_house') {
    const playerName = payloadText(event.payload, 'playerName') ?? 'Quelqu’un'
    return (
      <main className="screen-event screen-event--bingo" role="status" aria-live="assertive">
        <div className="screen-event__burst" aria-hidden="true">✦</div>
        <p className="screen-event__eyebrow">Carton plein · 16/16</p>
        <h1>🎉 BINGO !</h1>
        <p><strong>{playerName}</strong> vient de compléter toute sa grille.</p>
        <span className="screen-event__timer" />
      </main>
    )
  }

  const winner = teamName(payloadText(event.payload, 'winnerTeamId'))
  const nextA = teamName(payloadText(event.payload, 'nextTeamAId'))
  const nextB = teamName(payloadText(event.payload, 'nextTeamBId'))
  const isChampion = event.payload.isChampion === true

  if (beerPongPhase === 'next') {
    return (
      <main className="screen-event screen-event--pong screen-event--pong-next" role="status" aria-live="assertive">
        <p className="screen-event__eyebrow">Beer Pong · prochain match</p>
        <div className="screen-event__versus">
          <strong>{nextA}</strong>
          <b>VS</b>
          <strong>{nextB}</strong>
        </div>
        <p>Préparez les gobelets.</p>
        <span className="screen-event__timer" />
      </main>
    )
  }

  return (
    <main
      className={`screen-event screen-event--pong${hasNextMatch ? '' : ' screen-event--pong-final'}`}
      role="status"
      aria-live="assertive"
    >
      <p className="screen-event__eyebrow">
        {isChampion ? '🏆 Tournoi terminé' : 'Beer Pong · résultat'}
      </p>
      <h1>{isChampion ? 'Champions.' : 'Victoire.'}</h1>
      <p className="screen-event__winner">{winner}</p>
      <span className="screen-event__timer" />
    </main>
  )
}

export default ScreenEventOverlay
