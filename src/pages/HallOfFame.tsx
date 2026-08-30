import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../features/auth/AuthContext'
import {
  emptyHallOfFame,
  fetchHallOfFame,
  getBeerPongHallSummary,
  type HallOfFameData,
  type HallRankingRow,
} from '../features/hallOfFame/hallOfFame'
import { useParty } from '../features/party/PartyContext'
import { supabase } from '../lib/supabase'

import './HallOfFame.css'

const roomModeCopy = {
  likely: 'Plus susceptible de…',
  majority: 'Majority Rules',
  predict: 'Devine le groupe',
  who_said: 'Qui a répondu ça ?',
} as const

function leaderNames(rows: HallRankingRow[]) {
  if (rows.length === 0) return []
  const topScore = rows[0].score
  return rows
    .filter((row) => row.score === topScore)
    .map((row) => row.name)
}

function Ranking({
  rows,
  emptyCopy,
  unit,
}: {
  rows: HallRankingRow[]
  emptyCopy: string
  unit: string
}) {
  if (rows.length === 0) {
    return <p className="hall-ranking__empty">{emptyCopy}</p>
  }

  const topScore = rows[0]?.score ?? 0

  return (
    <div className="hall-ranking">
      {rows.slice(0, 6).map((row, index) => (
        <div
          key={`${row.name}-${index}`}
          className={
            row.score === topScore && row.score > 0
              ? 'hall-ranking__row hall-ranking__row--leader'
              : 'hall-ranking__row'
          }
        >
          <span className="hall-ranking__rank">
            {row.score === topScore && row.score > 0 ? '★' : index + 1}
          </span>
          <strong>{row.name}</strong>
          <span className="hall-ranking__score">
            {row.score} {unit}{row.score !== 1 ? 's' : ''}
          </span>
        </div>
      ))}
    </div>
  )
}

function HallOfFame() {
  const { isAdmin } = useAuth()
  const { settings, loading: partyLoading } = useParty()
  const [hall, setHall] = useState<HallOfFameData>(emptyHallOfFame)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadHall = useCallback(async () => {
    try {
      const next = await fetchHallOfFame()
      setHall(next)
      setError('')
    } catch (loadError) {
      console.error('Unable to load Hall of Fame:', loadError)
      setError('Le palmarès n’a pas pu être synchronisé.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadHall()
  }, [loadHall])

  useEffect(() => {
    const channel = supabase
      .channel('anniv-2026-hall-of-fame')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'beer_pong_state',
          filter: 'id=eq.main',
        },
        () => void loadHall(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'secret_mission_scoreboard',
        },
        () => void loadHall(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_vote_public_state',
          filter: 'id=eq.main',
        },
        () => void loadHall(),
      )
      .subscribe()

    const fallback = window.setInterval(
      () => void loadHall(),
      15000,
    )

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void loadHall()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.clearInterval(fallback)
      document.removeEventListener('visibilitychange', handleVisibility)
      void supabase.removeChannel(channel)
    }
  }, [loadHall])

  const beerPong = useMemo(
    () => getBeerPongHallSummary(hall.beerPong),
    [hall.beerPong],
  )

  const missionLeaders = useMemo(
    () => leaderNames(hall.missions.ranking),
    [hall.missions.ranking],
  )

  const roomLeaders = useMemo(
    () => leaderNames(hall.room.ranking),
    [hall.room.ranking],
  )

  if (partyLoading || loading) {
    return (
      <main className="hall hall--loading">
        <div className="hall__orb hall__orb--one" />
        <p>Ouverture du palmarès…</p>
      </main>
    )
  }

  if (!isAdmin && settings.phase !== 'ended') {
    return (
      <main className="hall hall--locked">
        <div className="hall__orb hall__orb--one" />
        <div className="hall__orb hall__orb--two" />
        <Link to="/" className="hall__back">← Accueil</Link>
        <section className="hall-locked">
          <p className="hall__eyebrow">Anniv 2026 · Hall of Fame</p>
          <h1>Pas encore.</h1>
          <p>Le palmarès sera dévoilé quand la soirée sera terminée.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="hall">
      <div className="hall__orb hall__orb--one" />
      <div className="hall__orb hall__orb--two" />

      <header className="hall-header">
        <Link to="/" className="hall__back">← Accueil</Link>
        <div className="hall-header__meta">
          <span>Anniv 2026</span>
          <span>Palmarès</span>
        </div>
      </header>

      {isAdmin && settings.phase !== 'ended' && (
        <div className="hall-preview">
          <strong>Aperçu admin</strong>
          <span>Les chiffres sont encore provisoires. Le public ne voit pas encore cette page.</span>
        </div>
      )}

      {error && <div className="hall-error">{error}</div>}

      <section className="hall-hero">
        <p className="hall__eyebrow">La soirée a parlé</p>
        <h1>Hall<br /><span>of Fame.</span></h1>
        <p>Champions, agents, mentalistes et chiffres qui resteront de l’Anniv 2026.</p>
      </section>

      <section className="hall-podium" aria-label="Grands gagnants">
        <article className="hall-winner hall-winner--pong">
          <div className="hall-winner__icon">🏆</div>
          <div>
            <span>Beer Pong · Champions</span>
            <h2>{beerPong.championName ?? 'À déterminer'}</h2>
            <p>
              {beerPong.championName
                ? `${beerPong.matchesPlayed} match${beerPong.matchesPlayed !== 1 ? 's' : ''} joué${beerPong.matchesPlayed !== 1 ? 's' : ''} dans le tournoi.`
                : beerPong.teamCount > 0
                  ? 'Le tournoi n’a pas encore désigné son équipe championne.'
                  : 'Le tournoi n’a pas encore été lancé.'}
            </p>
          </div>
        </article>

        <article className="hall-winner hall-winner--missions">
          <div className="hall-winner__icon">🕵️</div>
          <div>
            <span>Agent n°1</span>
            <h2>{missionLeaders.length > 0 ? missionLeaders.join(' · ') : 'À déterminer'}</h2>
            <p>
              {hall.missions.ranking[0]?.score
                ? `${hall.missions.ranking[0].score} mission${hall.missions.ranking[0].score !== 1 ? 's' : ''} réussie${hall.missions.ranking[0].score !== 1 ? 's' : ''}.`
                : 'Aucune mission réussie pour le moment.'}
            </p>
          </div>
        </article>

        <article className="hall-winner hall-winner--room">
          <div className="hall-winner__icon">🎯</div>
          <div>
            <span>Mentaliste de La Salle</span>
            <h2>{roomLeaders.length > 0 ? roomLeaders.join(' · ') : 'À déterminer'}</h2>
            <p>
              {hall.room.ranking[0]?.score
                ? `${hall.room.ranking[0].score} point${hall.room.ranking[0].score !== 1 ? 's' : ''} gagné${hall.room.ranking[0].score !== 1 ? 's' : ''} sur les prédictions et enquêtes.`
                : 'Aucun point distribué pour le moment.'}
            </p>
          </div>
        </article>
      </section>

      <section className="hall-stats" aria-label="Chiffres de la soirée">
        <article><strong>{hall.participants}</strong><span>participants confirmés</span></article>
        <article><strong>{hall.missions.completed}</strong><span>missions accomplies</span></article>
        <article><strong>{hall.room.votes}</strong><span>votes enregistrés</span></article>
        <article><strong>{hall.room.rounds}</strong><span>rounds révélés</span></article>
        <article><strong>{beerPong.teamCount}</strong><span>équipes Beer Pong</span></article>
      </section>

      <section className="hall-rankings">
        <article className="hall-ranking-card">
          <header>
            <div>
              <p className="hall__eyebrow">Infiltration</p>
              <h2>Top Missions</h2>
            </div>
            <strong>{hall.missions.completed}</strong>
          </header>
          <Ranking
            rows={hall.missions.ranking}
            emptyCopy="Le classement apparaîtra dès qu’une mission sera réussie."
            unit="mission"
          />
        </article>

        <article className="hall-ranking-card">
          <header>
            <div>
              <p className="hall__eyebrow">Prédictions & enquêtes</p>
              <h2>Top La Salle</h2>
            </div>
            <strong>{hall.room.points}</strong>
          </header>
          <Ranking
            rows={hall.room.ranking}
            emptyCopy="Le classement apparaîtra dès qu’un point sera distribué."
            unit="pt"
          />
        </article>
      </section>

      {hall.room.popularRound && (
        <section className="hall-popular">
          <div>
            <p className="hall__eyebrow">La question qui a mobilisé la salle</p>
            <h2>{hall.room.popularRound.prompt}</h2>
            <span>
              {roomModeCopy[hall.room.popularRound.mode]} · {hall.room.popularRound.votes} vote{hall.room.popularRound.votes !== 1 ? 's' : ''}
            </span>
          </div>
          <strong>{hall.room.popularRound.votes}</strong>
        </section>
      )}

      <footer className="hall-footer">
        <span>Anniv 2026 · Hall of Fame</span>
        <Link to="/">Retour à l’accueil ↑</Link>
      </footer>
    </main>
  )
}

export default HallOfFame
