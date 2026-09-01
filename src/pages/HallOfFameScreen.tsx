import { useEffect, useMemo, useState } from 'react'
import { getBeerPongHallSummary, type HallRankingRow } from '../features/hallOfFame/hallOfFame'
import { hallLeaders, type HallPhoto } from '../features/hallOfFame/highlights'
import { useHallOfFame } from '../features/hallOfFame/useHallOfFame'
import { useParty } from '../features/party/PartyContext'
import PhotoHuntImage from '../features/photo-hunt/PhotoHuntImage'
import './HallOfFameScreen.css'
import './HallOfFameEnriched.css'

type HallSlide = {
  id: string
  title: string
  unit?: string
  winners?: HallRankingRow[]
  photos?: HallPhoto[]
  tied?: boolean
}

function HallOfFameScreen() {
  const { settings } = useParty()
  const { hall, loading, error, available } = useHallOfFame(settings.photosVisible)
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const beerPong = getBeerPongHallSummary(hall.beerPong)
  const slides = useMemo(() => {
    const result: HallSlide[] = []
    const addWinners = (id: string, title: string, unit: string, rows: HallRankingRow[]) => {
      const leaders = hallLeaders(rows)
      for (let start = 0; start < leaders.length; start += 4) {
        result.push({ id: `${id}-${start}`, title, unit, winners: leaders.slice(start, start + 4), tied: leaders.length > 1 })
      }
    }
    if (settings.missionsVisible) addWinners('missions', '🕵️ Agents de la soirée', 'mission', hall.missions.ranking)
    if (settings.roomVisible) addWinners('room', '🎯 Mentalistes de La Salle', 'point', hall.room.ranking)
    if (settings.photosVisible && hall.photos) {
      addWinners('photographers', '📸 Photographes de la soirée', 'photo publiée', hall.photos.ranking)
      for (let start = 0; start < hall.photos.memories.length; start += 4) {
        result.push({ id: `memories-${start}`, title: 'La soirée en images', photos: hall.photos.memories.slice(start, start + 4) })
      }
    }
    result.push({ id: 'stats', title: 'Ça, c’était nous.' })
    return result
  }, [hall, settings.missionsVisible, settings.roomVisible, settings.photosVisible])
  const activeIndex = index % slides.length
  const slide = slides[activeIndex]

  useEffect(() => {
    if (paused || slides.length < 2) return
    const interval = window.setInterval(() => setIndex((value) => (value + 1) % slides.length), 12000)
    return () => window.clearInterval(interval)
  }, [paused, slides.length, activeIndex])

  if (loading) return <main className="hall-screen hall-screen--loading"><p>Préparation du Hall of Fame…</p></main>
  if (!available) return <main className="hall-screen hall-screen--loading"><p role="status">{error}</p></main>

  return (
    <main className="hall-screen hall-screen--enriched">
      <div className="hall-screen__orb hall-screen__orb--one" />
      <div className="hall-screen__orb hall-screen__orb--two" />
      <header className="hall-screen__topline">
        <div><span /> Anniv 2026 · Hall of Fame</div>
        <strong>{hall.participants} participants</strong>
      </header>
      {error && <p className="hall-screen__error" role="status">{error}</p>}
      <section className="hall-screen__layout">
        <div className="hall-screen__hero">
          <p>La soirée a parlé</p>
          <h1>Hall<br /><span>of Fame.</span></h1>
          {settings.beerPongVisible && <article className="hall-screen__champion">
            <span>🏆 Champions Beer Pong</span>
            <strong>{beerPong.championName ?? 'Pas de champion désigné'}</strong>
          </article>}
        </div>
        <div className="hall-screen__right">
          <section key={slide.id} className="hall-screen__slide" aria-label={slide.title}>
            <h2>{slide.title}</h2>
            {slide.winners && <div className="hall-screen__awards">
              <p>{slide.tied ? 'Premiers ex æquo' : 'Première place'}</p>
              {slide.winners.map((winner, position) => <article key={`${winner.name}-${position}`}>
                <strong>{winner.name}</strong>
                <span>{winner.score} {slide.unit === 'photo publiée' ? (winner.score > 1 ? 'photos publiées' : 'photo publiée') : `${slide.unit}${winner.score > 1 ? 's' : ''}`}</span>
              </article>)}
            </div>}
            {slide.photos && <div className="hall-screen__memories">
              {slide.photos.map((photo) => <figure key={photo.id}>
                <PhotoHuntImage path={photo.storage_path} alt={`Souvenir de ${photo.player_name}`} />
                <figcaption>{photo.player_name}</figcaption>
              </figure>)}
            </div>}
            {slide.id === 'stats' && <div className="hall-screen__stats">
              {settings.missionsVisible && <article><strong>{hall.missions.completed}</strong><span>missions réussies</span></article>}
              {settings.roomVisible && <article><strong>{hall.room.votes}</strong><span>votes enregistrés</span></article>}
              {settings.roomVisible && <article><strong>{hall.room.rounds}</strong><span>rounds révélés</span></article>}
              {settings.beerPongVisible && <article><strong>{beerPong.matchesPlayed}</strong><span>matchs Beer Pong</span></article>}
              {settings.photosVisible && hall.photos && <>
                <article><strong>{hall.photos.published}</strong><span>photos publiées</span></article>
                <article><strong>{hall.photos.photographers}</strong><span>photographes</span></article>
              </>}
            </div>}
          </section>
          <div className="hall-screen__footer-card">
            <div><span>Le palmarès complet reste en ligne</span><strong>Scanne pour revoir la soirée</strong></div>
            <div className="hall-screen__qr"><img src="/anniv-2026-qr.svg" alt="QR code Anniv 2026" /></div>
          </div>
        </div>
      </section>
      {slides.length > 1 && <nav className="hall-screen__controls" aria-label="Diaporama du palmarès">
        <button onClick={() => setIndex((activeIndex - 1 + slides.length) % slides.length)} aria-label="Écran précédent">←</button>
        <button onClick={() => setPaused((value) => !value)}>{paused ? 'Reprendre' : 'Pause'}</button>
        <span>{paused ? 'PAUSE' : 'AUTO'} {activeIndex + 1}/{slides.length}</span>
        <button onClick={() => setIndex((activeIndex + 1) % slides.length)} aria-label="Écran suivant">→</button>
      </nav>}
    </main>
  )
}

export default HallOfFameScreen
