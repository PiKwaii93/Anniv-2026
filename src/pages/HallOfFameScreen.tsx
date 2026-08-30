import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  emptyHallOfFame,
  fetchHallOfFame,
  getBeerPongHallSummary,
  type HallOfFameData,
} from '../features/hallOfFame/hallOfFame'

import './HallOfFameScreen.css'

function HallOfFameScreen() {
  const [hall, setHall] = useState<HallOfFameData>(emptyHallOfFame)
  const [loading, setLoading] = useState(true)

  const loadHall = useCallback(async () => {
    try {
      setHall(await fetchHallOfFame())
    } catch (error) {
      console.error('Unable to load TV Hall of Fame:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadHall()
    const interval = window.setInterval(() => void loadHall(), 15000)
    return () => window.clearInterval(interval)
  }, [loadHall])

  const beerPong = useMemo(
    () => getBeerPongHallSummary(hall.beerPong),
    [hall.beerPong],
  )

  const missionLeader = hall.missions.ranking[0]
  const roomLeader = hall.room.ranking[0]

  if (loading) {
    return (
      <main className="hall-screen hall-screen--loading">
        <p>Préparation du Hall of Fame…</p>
      </main>
    )
  }

  return (
    <main className="hall-screen">
      <div className="hall-screen__orb hall-screen__orb--one" />
      <div className="hall-screen__orb hall-screen__orb--two" />

      <header className="hall-screen__topline">
        <div><span /> Anniv 2026 · Hall of Fame</div>
        <strong>{hall.participants} participants</strong>
      </header>

      <section className="hall-screen__layout">
        <div className="hall-screen__hero">
          <p>La soirée a parlé</p>
          <h1>Hall<br /><span>of Fame.</span></h1>

          <article className="hall-screen__champion">
            <span>🏆 Champions Beer Pong</span>
            <strong>{beerPong.championName ?? 'À déterminer'}</strong>
          </article>
        </div>

        <div className="hall-screen__right">
          <div className="hall-screen__leaders">
            <article>
              <span>🕵️ Agent n°1</span>
              <strong>{missionLeader?.name ?? 'À déterminer'}</strong>
              <small>{missionLeader ? `${missionLeader.score} mission${missionLeader.score !== 1 ? 's' : ''}` : 'Aucun score'}</small>
            </article>

            <article>
              <span>🎯 Mentaliste</span>
              <strong>{roomLeader?.name ?? 'À déterminer'}</strong>
              <small>{roomLeader ? `${roomLeader.score} point${roomLeader.score !== 1 ? 's' : ''}` : 'Aucun score'}</small>
            </article>
          </div>

          <div className="hall-screen__stats">
            <article><strong>{hall.missions.completed}</strong><span>missions réussies</span></article>
            <article><strong>{hall.room.votes}</strong><span>votes enregistrés</span></article>
            <article><strong>{hall.room.rounds}</strong><span>rounds révélés</span></article>
            <article><strong>{beerPong.matchesPlayed}</strong><span>matchs Beer Pong</span></article>
          </div>

          <div className="hall-screen__footer-card">
            <div>
              <span>Le palmarès complet reste en ligne</span>
              <strong>Scanne pour revoir la soirée</strong>
            </div>
            <div className="hall-screen__qr">
              <img src="/anniv-2026-qr.svg" alt="QR code Anniv 2026" />
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

export default HallOfFameScreen
