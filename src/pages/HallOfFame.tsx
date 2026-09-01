import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../features/auth/AuthContext'
import {
  getBeerPongHallSummary,
  type HallRankingRow,
} from '../features/hallOfFame/hallOfFame'
import { useParty } from '../features/party/PartyContext'
import { useHallOfFame } from '../features/hallOfFame/useHallOfFame'
import { hallLeaders, hallRank, positiveRanking } from '../features/hallOfFame/highlights'
import PhotoHuntImage from '../features/photo-hunt/PhotoHuntImage'

import './HallOfFame.css'
import './HallOfFameEnriched.css'

const roomModeCopy = {
  likely: 'Plus susceptible de…',
  majority: 'Majority Rules',
  predict: 'Devine le groupe',
  who_said: 'Qui a répondu ça ?',
} as const

function Ranking({
  rows,
  emptyCopy,
  unit,
}: {
  rows: HallRankingRow[]
  emptyCopy: string
  unit: string
}) {
  const ranked = positiveRanking(rows)
  if (ranked.length === 0) {
    return <p className="hall-ranking__empty">{emptyCopy}</p>
  }

  const topScore = ranked[0]?.score ?? 0

  return (
    <div className="hall-ranking">
      {ranked.map((row, index) => (
        <div
          key={`${row.name}-${index}`}
          className={
            row.score === topScore && row.score > 0
              ? 'hall-ranking__row hall-ranking__row--leader'
              : 'hall-ranking__row'
          }
        >
          <span className="hall-ranking__rank">
            {row.score === topScore && row.score > 0 ? '★' : hallRank(ranked, row.score)}
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
  const canView = !partyLoading && (isAdmin || settings.phase === 'ended')
  const { hall, loading, error, available } = useHallOfFame(settings.photosVisible, canView)

  const beerPong = useMemo(
    () => getBeerPongHallSummary(hall.beerPong),
    [hall.beerPong],
  )

  const missionLeaders = useMemo(
    () => hallLeaders(hall.missions.ranking).map((row) => row.name),
    [hall.missions.ranking],
  )

  const roomLeaders = useMemo(
    () => hallLeaders(hall.room.ranking).map((row) => row.name),
    [hall.room.ranking],
  )

  if (partyLoading || (canView && loading)) {
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

  if (!available) return <main className="hall hall--loading"><p role="status">{error}</p><Link to="/">← Accueil</Link></main>

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
        <p>Champions, agents, mentalistes, photographes et souvenirs qui resteront de l’Anniv 2026.</p>
      </section>

      <section className="hall-podium" aria-label="Grands gagnants">
        {settings.beerPongVisible && <article className="hall-winner hall-winner--pong">
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
        </article>}

        {settings.missionsVisible && <article className="hall-winner hall-winner--missions">
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
        </article>}

        {settings.roomVisible && <article className="hall-winner hall-winner--room">
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
        </article>}

        {settings.photosVisible && hall.photos && <article className="hall-winner hall-winner--photos">
          <div className="hall-winner__icon">📸</div>
          <div>
            <span>Photo Hunt · Photographes de la soirée</span>
            <h2>{hallLeaders(hall.photos.ranking).map((row) => row.name).join(' · ') || 'À déterminer'}</h2>
            <p>{hall.photos.ranking[0]
              ? `${hall.photos.ranking[0].score} photo${hall.photos.ranking[0].score > 1 ? 's' : ''} publiée${hall.photos.ranking[0].score > 1 ? 's' : ''} par photographe en tête.`
              : 'Aucune photo publiée pour le moment.'}</p>
            {hallLeaders(hall.photos.ranking).length > 1 && <p>Premiers ex æquo</p>}
          </div>
        </article>}
      </section>

      <section className="hall-stats" aria-label="Chiffres de la soirée">
        <article><strong>{hall.participants}</strong><span>participants confirmés</span></article>
        {settings.missionsVisible && <article><strong>{hall.missions.completed}</strong><span>missions accomplies</span></article>}
        {settings.roomVisible && <article><strong>{hall.room.votes}</strong><span>votes enregistrés</span></article>}
        {settings.roomVisible && <article><strong>{hall.room.rounds}</strong><span>rounds révélés</span></article>}
        {settings.beerPongVisible && <article><strong>{beerPong.teamCount}</strong><span>équipes Beer Pong</span></article>}
      </section>

      {settings.photosVisible && hall.photos && <section className="hall-photo-stats" aria-label="Photo Hunt en chiffres">
        <p><strong>{hall.photos.published}</strong> photos publiées</p>
        <p><strong>{hall.photos.photographers}</strong> photographes</p>
        <span>Les photos en validation ou refusées ne comptent pas.</span>
      </section>}

      <section className="hall-rankings">
        {settings.missionsVisible && <article className="hall-ranking-card">
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
        </article>}

        {settings.roomVisible && <article className="hall-ranking-card">
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
        </article>}

        {settings.photosVisible && hall.photos && <article className="hall-ranking-card">
          <header><div><p className="hall__eyebrow">Derrière l’objectif</p><h2>Top Photo Hunt</h2></div><strong>{hall.photos.published}</strong></header>
          <Ranking rows={hall.photos.ranking} emptyCopy="Le classement apparaîtra dès qu’une photo sera publiée." unit="photo" />
        </article>}
      </section>

      {settings.roomVisible && hall.room.popularRound && (
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

      {settings.photosVisible && hall.photos && hall.photos.memories.length > 0 && <section className="hall-memories" aria-label="Souvenirs de la soirée">
        <header><div><p className="hall__eyebrow">On garde ça.</p><h2>La soirée en images</h2></div><Link to="/photos">Toutes les photos ↗</Link></header>
        <div className="hall-memories__grid">
          {hall.photos.memories.map((photo) => <figure key={photo.id}>
            <PhotoHuntImage path={photo.storage_path} alt={`Souvenir de ${photo.player_name}`} className="hall-memories__image" />
            <figcaption><strong>{photo.player_name}</strong>{photo.caption && <p>{photo.caption}</p>}</figcaption>
          </figure>)}
        </div>
      </section>}

      <footer className="hall-footer">
        <span>Anniv 2026 · Hall of Fame</span>
        <Link to="/">Retour à l’accueil ↑</Link>
      </footer>
    </main>
  )
}

export default HallOfFame
