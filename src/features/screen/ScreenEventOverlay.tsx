import { useCallback, useEffect, useMemo, useState } from 'react'

import { supabase } from '../../lib/supabase'
import GuestAvatar from '../guests/GuestAvatar'

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
  avatarPath?: string | null
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
  const [bingoAvatarPath, setBingoAvatarPath] = useState<string | null>(null)
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

  const loadBingoWinner = useCallback(async () => {
    if (event.event_type !== 'bingo_full_house') return

    const playerKey = payloadText(event.payload, 'playerKey')
    const separatorIndex = playerKey?.indexOf(':') ?? -1
    const playerType = separatorIndex > 0 ? playerKey?.slice(0, separatorIndex) : null
    const playerId = separatorIndex > 0 ? playerKey?.slice(separatorIndex + 1) : null

    if (!playerId || (playerType !== 'guest' && playerType !== 'plus')) {
      setBingoAvatarPath(null)
      return
    }

    const query = playerType === 'guest'
      ? supabase.from('guests').select('avatar_path').eq('id', playerId).maybeSingle()
      : supabase.from('plus_ones').select('avatar_path').eq('id', playerId).maybeSingle()
    const { data, error } = await query

    if (error) {
      console.error('[ScreenDirector][BINGO_AVATAR_LOAD_ERROR]', error)
      setBingoAvatarPath(null)
      return
    }

    setBingoAvatarPath((data as { avatar_path: string | null } | null)?.avatar_path ?? null)
  }, [event.event_type, event.payload])

  useEffect(() => {
    setBeerPongPhase('result')
    setBingoAvatarPath(null)
    void loadBeerPong()
    void loadBingoWinner()
  }, [event.id, loadBeerPong, loadBingoWinner])

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
  const teamPlayers = useCallback((teamId: string | null) => {
    if (!teamId) return []
    const team = teamById.get(teamId)
    if (!team) return []
    return team.playerIds.flatMap((playerId) => {
      const player = playerById.get(playerId)
      return player ? [player] : []
    })
  }, [playerById, teamById])

  const renderTeamAvatars = (teamId: string | null) => (
    <div className="screen-event__avatars" aria-hidden="true">
      {teamPlayers(teamId).map((player) => (
        <GuestAvatar
          key={player.id}
          name={player.name}
          path={player.avatarPath}
          size="large"
        />
      ))}
    </div>
  )

  if (event.event_type === 'bingo_full_house') {
    const playerName = payloadText(event.payload, 'playerName') ?? 'Quelqu’un'
    return (
      <main className="screen-event screen-event--bingo" role="status" aria-live="assertive">
        <div className="screen-event__burst" aria-hidden="true">✦</div>
        <p className="screen-event__eyebrow">Carton plein · 16/16</p>
        <div className="screen-event__bingo-winner">
          <GuestAvatar name={playerName} path={bingoAvatarPath} size="large" />
          <h1>🎉 BINGO !</h1>
        </div>
        <p><strong>{playerName}</strong> vient de compléter toute sa grille.</p>
        <span className="screen-event__timer" />
      </main>
    )
  }

  const winner = teamName(payloadText(event.payload, 'winnerTeamId'))
  const nextA = teamName(payloadText(event.payload, 'nextTeamAId'))
  const nextB = teamName(payloadText(event.payload, 'nextTeamBId'))
  const winnerTeamId = payloadText(event.payload, 'winnerTeamId')
  const nextTeamAId = payloadText(event.payload, 'nextTeamAId')
  const nextTeamBId = payloadText(event.payload, 'nextTeamBId')
  const isChampion = event.payload.isChampion === true

  if (beerPongPhase === 'next') {
    return (
      <main className="screen-event screen-event--pong screen-event--pong-next" role="status" aria-live="assertive">
        <p className="screen-event__eyebrow">Beer Pong · prochain match</p>
        <div className="screen-event__versus">
          <div className="screen-event__team">
            {renderTeamAvatars(nextTeamAId)}
            <strong>{nextA}</strong>
          </div>
          <b>VS</b>
          <div className="screen-event__team">
            {renderTeamAvatars(nextTeamBId)}
            <strong>{nextB}</strong>
          </div>
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
      <div className="screen-event__winner-team">
        {renderTeamAvatars(winnerTeamId)}
        <p className="screen-event__winner">{winner}</p>
      </div>
      <span className="screen-event__timer" />
    </main>
  )
}

export default ScreenEventOverlay
