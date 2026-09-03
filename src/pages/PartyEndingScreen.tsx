import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAnnouncement } from '../features/announcements/AnnouncementContext'
import { getBeerPongHallSummary } from '../features/hallOfFame/hallOfFame'
import { useHallOfFame } from '../features/hallOfFame/useHallOfFame'
import { useParty } from '../features/party/PartyContext'
import { buildCredits, type CreditsSlide } from '../features/party-extras/credits'
import { usePartyExtras } from '../features/party-extras/usePartyExtras'
import PhotoHuntImage from '../features/photo-hunt/PhotoHuntImage'
import HallOfFameScreen from './HallOfFameScreen'
import './PartyEndingScreen.css'

function rememberEnding(key: string) { try { sessionStorage.setItem('anniv2026:credits-done', key) } catch { /* Private browsing can disable storage. */ } }
function rememberedEnding() { try { return sessionStorage.getItem('anniv2026:credits-done') ?? '' } catch { return '' } }

function CreditsPlayer({ slides, finish, suspended }: { slides: CreditsSlide[]; finish: () => void; suspended: boolean }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const slide = slides[Math.min(index, slides.length - 1)]
  useEffect(() => {
    // Keep the current slide mounted, but give it ten visible seconds after an
    // announcement ends. Automatic suspension must never undo a manual pause.
    if (paused || suspended) return
    const timer = window.setTimeout(() => { if (index >= slides.length - 1) finish(); else setIndex((value) => value + 1) }, 10000)
    return () => window.clearTimeout(timer)
  }, [index, slides.length, paused, suspended, finish])
  return <main className="credits-screen" inert={suspended} aria-hidden={suspended}>
    <header><span>ANNIV 2026</span><span>Le générique · {index + 1}/{slides.length}</span></header>
    <section key={slide.id} className="credits-slide" aria-live="polite"><p className="credits-kicker">Une soirée, plein d’histoires</p><h1>{slide.title}</h1>{slide.subtitle && <p className="credits-subtitle">{slide.subtitle}</p>}
      {slide.names && <div className="credits-names">{slide.names.map((name, i) => <span key={`${name}-${i}`}>{name}</span>)}</div>}
      {slide.photos && <div className="credits-photos">{slide.photos.map((photo) => <figure key={photo.id}><PhotoHuntImage path={photo.storage_path} alt={photo.caption || `Souvenir de ${photo.player_name}`} /><figcaption>{photo.player_name}</figcaption></figure>)}</div>}
    </section>
    <footer><button disabled={suspended} onClick={() => setPaused((value) => !value)} aria-pressed={paused}>{paused ? '▶ Reprendre' : 'Ⅱ Pause'}</button><button disabled={suspended} onClick={() => { if (index >= slides.length - 1) finish(); else setIndex((value) => value + 1) }}>Suivant →</button><button disabled={suspended} onClick={finish}>Voir le palmarès ↗</button></footer>
  </main>
}

export default function PartyEndingScreen() {
  const { settings } = useParty()
  const { visible: announcementVisible, loading: announcementLoading, refresh: refreshAnnouncement } = useAnnouncement()
  const { data, error } = usePartyExtras()
  const [done, setDone] = useState(rememberedEnding)
  const [skip, setSkip] = useState(false)
  const [syncedEnding, setSyncedEnding] = useState<string | null>(null)
  const endingKey = data?.ending_key
  useEffect(() => {
    if (!endingKey) return
    let current = true
    // Party state and announcement updates arrive on separate subscriptions.
    // Re-read announcements for this ending before starting the first timer.
    const settled = () => { if (current) setSyncedEnding(endingKey) }
    void refreshAnnouncement().then(settled, settled)
    return () => { current = false }
  }, [endingKey, refreshAnnouncement])
  const suspended = announcementLoading || announcementVisible || syncedEnding !== endingKey
  const finish = useCallback(() => { if (endingKey) { rememberEnding(endingKey); setDone(endingKey) } else setSkip(true) }, [endingKey])
  const creditsActive = !!data?.settings.credits_enabled && done !== data.ending_key
  const { hall, loading, error: hallError } = useHallOfFame(settings.photosVisible, creditsActive)
  const slides = useMemo(() => buildCredits(data?.credits_names ?? [], hall, settings, getBeerPongHallSummary(hall.beerPong).championPlayers), [data?.credits_names, hall, settings])
  if (skip || error || (data && !creditsActive)) return <HallOfFameScreen />
  if (!data || loading) return <main className="credits-screen credits-screen--loading" inert={suspended} aria-hidden={suspended}><p>Le générique se prépare…</p><button disabled={suspended} onClick={finish}>Passer au palmarès</button></main>
  return <><CreditsPlayer key={data.ending_key} slides={slides} finish={finish} suspended={suspended} />{hallError && <p className="credits-sync" role="status">Certaines données du palmarès ne sont pas disponibles.</p>}</>
}
