import type { Ref } from 'react'

import GuestAvatar from '../guests/GuestAvatar'
import { getRoundName, type TournamentMatch, type TournamentTeam } from './tournament'

import './TournamentBracket.css'

type Player = {
  id: string
  name: string
  avatarPath?: string | null
}

type Props = {
  rounds: TournamentMatch[][]
  teams: TournamentTeam[]
  players: Player[]
  activeRoundIndex: number
  variant?: 'page' | 'tv'
  scrollRef?: Ref<HTMLDivElement>
  onPickWinner?: (
    roundIndex: number,
    matchIndex: number,
    match: TournamentMatch,
    teamId: string,
  ) => void
}

export default function TournamentBracket({
  rounds,
  teams,
  players,
  activeRoundIndex,
  variant = 'page',
  scrollRef,
  onPickWinner,
}: Props) {
  if (rounds.length === 0) return null

  const teamById = new Map(teams.map((team) => [team.id, team]))
  const playerById = new Map(players.map((player) => [player.id, player]))
  const matchNumbers = new Map<string, number>()
  let matchNumber = 1
  for (const round of rounds) {
    for (const match of round) {
      matchNumbers.set(match.id, matchNumber)
      matchNumber += 1
    }
  }

  const tv = variant === 'tv'
  const columnWidth = tv ? 300 : 280
  const cardWidth = tv ? 252 : 238
  const cardHeight = tv ? 48 : 82
  const rowStep = tv ? 50 : 94
  const headingHeight = tv ? 34 : 48
  const width = (rounds.length - 1) * columnWidth + cardWidth
  const height = headingHeight + rounds[0].length * rowStep
  const centerY = (roundIndex: number, index: number) => (
    headingHeight + (index + 0.5) * rowStep * (2 ** roundIndex)
  )

  const teamName = (teamId: string) => {
    const team = teamById.get(teamId)
    if (!team) return 'Équipe inconnue'
    return team.playerIds.map((id) => playerById.get(id)?.name ?? 'Joueur').join(' & ')
  }

  const sourceLabel = (sourceId: string | null | undefined, roundIndex: number) => {
    if (roundIndex === 0 || !sourceId) return 'Exempt'
    return `Vainqueur M${String(matchNumbers.get(sourceId) ?? '?').padStart(2, '0')}`
  }

  return (
    <div
      ref={scrollRef}
      className={`tournament-tree tournament-tree--${variant}`}
      tabIndex={0}
      aria-label="Arbre complet du tournoi"
    >
      <div className="tournament-tree__canvas" style={{ width, height }}>
        <svg className="tournament-tree__connections" width={width} height={height} aria-hidden="true">
          {rounds.slice(0, -1).flatMap((round, roundIndex) => round.map((match, index) => {
            const startX = roundIndex * columnWidth + cardWidth
            const endX = (roundIndex + 1) * columnWidth
            const bendX = startX + (endX - startX) / 2
            const startY = centerY(roundIndex, index)
            const endY = centerY(roundIndex + 1, Math.floor(index / 2))
            return <path key={match.id} d={`M ${startX} ${startY} H ${bendX} V ${endY} H ${endX}`} />
          }))}
        </svg>

        {rounds.map((round, roundIndex) => (
          <section
            key={`tree-round-${roundIndex}`}
            className={`tournament-tree__round${roundIndex === activeRoundIndex ? ' is-active' : ''}`}
            style={{ left: roundIndex * columnWidth, width: cardWidth }}
            aria-label={getRoundName(round, roundIndex)}
          >
            <header>
              <span>{String(roundIndex + 1).padStart(2, '0')}</span>
              <strong>{getRoundName(round, roundIndex)}</strong>
            </header>

            {round.map((match, index) => {
              const top = centerY(roundIndex, index) - cardHeight / 2
              const playable = Boolean(match.teamAId && match.teamBId)
              const editable = Boolean(onPickWinner && playable && roundIndex <= activeRoundIndex)
              return (
                <article
                  key={match.id}
                  className={`tournament-tree__match${match.winnerTeamId ? ' is-complete' : ''}`}
                  style={{ top, height: cardHeight }}
                >
                  <span className="tournament-tree__match-number">M{String(matchNumbers.get(match.id)).padStart(2, '0')}</span>
                  {(['A', 'B'] as const).map((slot) => {
                    const teamId = slot === 'A' ? match.teamAId : match.teamBId
                    const sourceId = slot === 'A' ? match.teamASourceMatchId : match.teamBSourceMatchId
                    const team = teamId ? teamById.get(teamId) : undefined
                    return (
                      <button
                        key={slot}
                        type="button"
                        disabled={!editable || !teamId}
                        className={`tournament-tree__slot${teamId && match.winnerTeamId === teamId ? ' is-winner' : ''}${!teamId ? ' is-waiting' : ''}`}
                        onClick={() => teamId && onPickWinner?.(
                          roundIndex,
                          index,
                          match,
                          teamId,
                        )}
                      >
                        {!tv && team && (
                          <span className="tournament-tree__faces" aria-hidden="true">
                            {team.playerIds.map((playerId) => {
                              const player = playerById.get(playerId)
                              return <GuestAvatar key={playerId} name={player?.name ?? 'Joueur'} path={player?.avatarPath} size="small" />
                            })}
                          </span>
                        )}
                        <span>{teamId ? teamName(teamId) : sourceLabel(sourceId, roundIndex)}</span>
                        {teamId && match.winnerTeamId === teamId && <b aria-label="Qualifiée">✓</b>}
                      </button>
                    )
                  })}
                </article>
              )
            })}
          </section>
        ))}
      </div>
    </div>
  )
}
