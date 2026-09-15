import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  completeGuestGuide,
  GUEST_GUIDE_REPLAY_EVENT,
  hasCompletedGuestGuide,
  type GuestGuidePhase,
} from './guestGuideState'
import './GuestWelcomeGuide.css'

type GuestWelcomeGuideProps = {
  enabled: boolean
  phase: GuestGuidePhase
}

type GuideVisual =
  | 'home'
  | 'games'
  | 'photos'
  | 'music'
  | 'prepare-home'
  | 'prepare-info'
  | 'prepare-bring'
  | 'prepare-chat'
  | 'prepare-guests'

type GuideSlide = {
  visual: GuideVisual
  eyebrow: string
  title: string
  body: string
}

const liveSlides: GuideSlide[] = [
  {
    visual: 'home',
    eyebrow: 'Bienvenue',
    title: 'Toute la soirée, ici.',
    body: 'Tout ce dont tu as besoin pendant la soirée.',
  },
  {
    visual: 'games',
    eyebrow: 'Jouer',
    title: 'Participe à ton rythme.',
    body: 'Choisis les activités qui te tentent.',
  },
  {
    visual: 'photos',
    eyebrow: 'Photos',
    title: 'Capture la soirée.',
    body: 'Relève les défis et partage les souvenirs.',
  },
  {
    visual: 'music',
    eyebrow: 'Musique',
    title: 'Ajoute ton morceau.',
    body: 'Fais vivre la playlist de la soirée.',
  },
]

const preparationSlides: GuideSlide[] = [
  {
    visual: 'prepare-home',
    eyebrow: 'Bienvenue',
    title: 'Prépare la soirée.',
    body: 'Retrouve ici tout ce qui est utile avant le jour J.',
  },
  {
    visual: 'prepare-info',
    eyebrow: 'Infos pratiques',
    title: 'Tout savoir avant de venir.',
    body: 'Date, lieu et accès restent toujours à portée de main.',
  },
  {
    visual: 'prepare-bring',
    eyebrow: 'Organisation',
    title: 'Dis ce que tu ramènes.',
    body: 'Consulte la liste et ajoute ce que tu prévois d’apporter.',
  },
  {
    visual: 'prepare-chat',
    eyebrow: 'Discussion',
    title: 'Échange avec les invités.',
    body: 'Une conversation commune pour préparer la soirée ensemble.',
  },
  {
    visual: 'prepare-guests',
    eyebrow: 'Invités',
    title: 'Découvre qui sera là.',
    body: 'La liste se complète au fil des confirmations.',
  },
]

function PreparationGuideVisual({ visual }: { visual: GuideVisual }) {
  if (visual === 'prepare-home') {
    return (
      <div className="guest-guide-demo guest-guide-demo--prepare-home">
        <div className="guest-guide-demo__prepare-heading">
          <p className="guest-guide-demo__brand">ANNIV <span>2026</span></p>
          <span>Avant la soirée</span>
        </div>
        <h3>Bienvenue.</h3>
        <article className="guest-guide-demo__hero">
          <small>Maintenant</small>
          <strong>On se retrouve bientôt.</strong>
          <span>Organise les derniers détails avec les autres invités.</span>
          <b>Voir l’organisation <i>→</i></b>
        </article>
        <p className="guest-guide-demo__group-title">Organisation de la soirée</p>
        <div className="guest-guide-demo__prepare-grid">
          <article><i>i</i><strong>Infos pratiques</strong><small>Date, lieu, accès et détails utiles pour la soirée.</small><b>→</b></article>
          <article><i>⌑</i><strong>Ce qu’on ramène</strong><small>Consulte la liste et indique ce que tu prévois d’apporter.</small><b>→</b></article>
          <article><i>●</i><strong>Discussion entre invités</strong><small>Écris un message à tous les invités.</small><b>→</b></article>
          <article><i>○</i><strong>Liste des invités</strong><small>Découvre qui sera présent à la soirée.</small><b>→</b></article>
        </div>
      </div>
    )
  }

  if (visual === 'prepare-info') {
    return (
      <div className="guest-guide-demo guest-guide-demo--prepare-module guest-guide-demo--prepare-info">
        <p className="guest-guide-demo__info-kicker">ANNIV 2026</p>
        <h3>Infos pratiques</h3>
        <p className="guest-guide-demo__intro">Tout ce qu’il faut pour arriver tranquille.</p>
        <div className="guest-guide-demo__info-card">
          <article className="guest-guide-demo__info-date"><i>24</i><span><small>Date et heure</small><strong>samedi 24 octobre 2026 à 21:30</strong></span></article>
          <article className="guest-guide-demo__info-address"><i>↗</i><span><small>Adresse</small><strong>19 Rue Louison Bobet, Neuilly-Plaisance</strong><b>Ouvrir dans Google Maps <em>↗</em></b></span></article>
          <article className="guest-guide-demo__info-dress"><i>✦</i><span><small>Tenue</small><strong>Tenue libre</strong></span></article>
        </div>
      </div>
    )
  }

  if (visual === 'prepare-bring') {
    return (
      <div className="guest-guide-demo guest-guide-demo--prepare-module guest-guide-demo--prepare-bring">
        <p className="guest-guide-demo__section-label">Organisation</p>
        <h3>Ce qu’on ramène</h3>
        <p className="guest-guide-demo__intro">Une liste commune pour éviter les oublis et les doublons.</p>
        <div className="guest-guide-demo__bring-summary">
          <span><strong>6</strong><small>éléments</small></span>
          <span><strong>4</strong><small>déjà pris</small></span>
        </div>
        <div className="guest-guide-demo__bring-list">
          <article><i>✓</i><span><strong>Boissons</strong><small>Pris par Camille</small></span><b>2</b></article>
          <article><i>✓</i><span><strong>À manger</strong><small>Pris par Alex</small></span><b>2</b></article>
          <article><i>○</i><span><strong>Glaçons</strong><small>Encore disponible</small></span><b>1</b></article>
        </div>
        <button type="button" tabIndex={-1}>Ajouter ce que j’apporte <span>＋</span></button>
      </div>
    )
  }

  if (visual === 'prepare-chat') {
    return (
      <div className="guest-guide-demo guest-guide-demo--prepare-module guest-guide-demo--prepare-chat">
        <div className="guest-guide-demo__chat-heading">
          <div><p className="guest-guide-demo__section-label">Entre invités</p><h3>Discussion</h3></div>
          <span>8 participants</span>
        </div>
        <div className="guest-guide-demo__messages">
          <article><i>C</i><div><small>Camille · 18:42</small><p>Je peux ramener des boissons 🥤</p></div></article>
          <article><i>A</i><div><small>Alex · 18:45</small><p>Parfait, je m’occupe de quoi manger !</p></div></article>
          <article className="is-self"><div><small>Toi · 18:47</small><p>Merci, j’ai mis la liste à jour ✨</p></div></article>
        </div>
        <div className="guest-guide-demo__composer"><span>Écrire un message…</span><b>↑</b></div>
      </div>
    )
  }

  return (
    <div className="guest-guide-demo guest-guide-demo--prepare-module guest-guide-demo--prepare-guests">
      <div className="guest-guide-demo__guest-heading">
        <div><p className="guest-guide-demo__section-label">La soirée</p><h3>Les invités</h3></div>
        <span><strong>12</strong> confirmés</span>
      </div>
      <p className="guest-guide-demo__intro">Découvre les personnes qui seront de la partie.</p>
      <div className="guest-guide-demo__guest-list">
        <article><i>CM</i><span><strong>Camille</strong><small>Confirmée</small></span><b>✓</b></article>
        <article><i>AL</i><span><strong>Alex</strong><small>Confirmé</small></span><b>✓</b></article>
        <article><i>SA</i><span><strong>Sarah</strong><small>Confirmée</small></span><b>✓</b></article>
        <article><i>TH</i><span><strong>Thomas</strong><small>En attente</small></span><b>·</b></article>
      </div>
      <div className="guest-guide-demo__guest-footer"><span>12 viennent</span><span>3 en attente</span></div>
    </div>
  )
}

function GuestGuideVisual({ visual }: { visual: GuideVisual }) {
  if (visual.startsWith('prepare-')) return <PreparationGuideVisual visual={visual} />

  if (visual === 'home') {
    return (
      <div className="guest-guide-demo guest-guide-demo--home">
        <p className="guest-guide-demo__brand">ANNIV <span>2026</span></p>
        <span className="guest-guide-demo__home-status">Avant la soirée</span>
        <h3 className="guest-guide-demo__home-greeting">Bienvenue.</h3>
        <article className="guest-guide-demo__hero">
          <small>Maintenant</small>
          <strong>La soirée est à toi.</strong>
          <span>Participe à ton rythme.</span>
          <b>Découvrir les jeux <i>→</i></b>
        </article>
        <p className="guest-guide-demo__group-title guest-guide-demo__group-title--organization">Organisation de la soirée</p>
        <div className="guest-guide-demo__shortcuts">
          <div><i>i</i><b>Infos pratiques</b><small>Date, lieu, accès et détails utiles.</small><span>→</span></div>
          <div><i>⌑</i><b>Ce qu’on ramène</b><small>Consulte la liste et indique ce que tu apportes.</small><span>→</span></div>
          <div><i>●</i><b>Discussion entre invités</b><small>Écris un message à tous les invités.</small><span>→</span></div>
          <div><i>○</i><b>Liste des invités</b><small>Découvre qui sera présent à la soirée.</small><span>→</span></div>
        </div>
        <p className="guest-guide-demo__group-title guest-guide-demo__group-title--memories">Souvenirs &amp; rencontres</p>
        <div className="guest-guide-demo__memories">
          <div><i>✉</i><b>La capsule</b><span>Quelques mots pour plus tard</span></div>
          <div><i>△</i><b>L’iceberg</b><span>Les histoires entre nous</span></div>
          <div><i>○</i><b>Les invités</b><span>Qui est de la partie ?</span></div>
        </div>
      </div>
    )
  }

  if (visual === 'games') {
    return (
      <div className="guest-guide-demo guest-guide-demo--games">
        <p className="guest-guide-demo__section-label">À ton rythme</p>
        <h3>On joue ?</h3>
        <div className="guest-guide-demo__game-list">
          <article className="is-live">
            <i>◉</i><span><strong>La Salle</strong><small>Vote avec tout le monde.</small></span><b>→</b>
          </article>
          <article>
            <i>◇</i><span><strong>Missions secrètes</strong><small>Un objectif à accomplir discrètement.</small></span><b>→</b>
          </article>
          <article>
            <i>▦</i><span><strong>Bingo</strong><small>Observe la soirée et coche les scènes.</small></span><b>→</b>
          </article>
          <article>
            <i>◌</i><span><strong>Beer Pong</strong><small>Les équipes et les prochains matchs.</small></span><b>→</b>
          </article>
          <article>
            <i>↔</i><span><strong>Duos surprise</strong><small>Un partenaire et un défi à deux.</small></span><b>→</b>
          </article>
        </div>
      </div>
    )
  }

  if (visual === 'photos') {
    return (
      <div className="guest-guide-demo guest-guide-demo--photos">
        <p className="guest-guide-demo__photo-label">ANNIV 2026 · CHASSE PHOTO</p>
        <h3>Les <span>photos.</span></h3>
        <p className="guest-guide-demo__intro">Un défi, une photo, un souvenir.</p>
        <div className="guest-guide-demo__tabs">
          <b>Défis</b><span>Galerie</span><span>Mes photos</span>
        </div>
        <div className="guest-guide-demo__subheading">
          <small>Pour toi</small>
          <strong>Ton prochain défi</strong>
        </div>
        <article className="guest-guide-demo__challenge">
          <small>01</small>
          <strong>Prends la photo la plus cinématographique possible de la soirée.</strong>
          <span>Faire ce défi →</span>
        </article>
        <div className="guest-guide-demo__more">
          <small>Autres défis</small>
          <strong>0 / 24 tentés</strong>
        </div>
      </div>
    )
  }

  return (
    <div className="guest-guide-demo guest-guide-demo--music">
      <p className="guest-guide-demo__music-label">La musique</p>
      <h3>On met quoi ?</h3>
      <p className="guest-guide-demo__intro">Cherche, choisis ton morceau et ajoute-le à la soirée.</p>
      <div className="guest-guide-demo__tabs guest-guide-demo__tabs--music">
        <b>Ajouter un morceau</b><span>La sélection</span>
      </div>
      <article className="guest-guide-demo__field guest-guide-demo__contribution">
        <strong>Ta contribution</strong>
        <p>0/3 propositions utilisées</p>
        <label>Titre</label>
        <span className="guest-guide-demo__input">Le morceau qui fait lever tout le monde</span>
        <label>Préciser l’artiste · facultatif</label>
        <small>Aucun compte Spotify nécessaire.</small>
        <b>Rechercher mon morceau</b>
      </article>
    </div>
  )
}

export function GuestWelcomeGuide({ enabled, phase }: GuestWelcomeGuideProps) {
  const slides = phase === 'preparation' ? preparationSlides : liveSlides
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const pointerStart = useRef<number | null>(null)
  const dialogRef = useRef<HTMLElement | null>(null)

  const finish = () => {
    completeGuestGuide(phase)
    setOpen(false)
  }

  useEffect(() => {
    setOpen(false)
    if (!enabled || hasCompletedGuestGuide(phase)) return
    const timer = window.setTimeout(() => {
      setStep(0)
      setOpen(true)
    }, 260)
    return () => window.clearTimeout(timer)
  }, [enabled, phase])

  useEffect(() => {
    const replay = () => {
      if (!enabled) return
      setStep(0)
      setOpen(true)
    }
    window.addEventListener(GUEST_GUIDE_REPLAY_EVENT, replay)
    return () => window.removeEventListener(GUEST_GUIDE_REPLAY_EVENT, replay)
  }, [enabled, phase])

  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    document.body.style.overflow = 'hidden'

    const focusable = () =>
      Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [])

    const focusFrame = window.requestAnimationFrame(() => dialogRef.current?.focus())
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        finish()
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        setStep((current) => Math.min(current + 1, slides.length - 1))
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setStep((current) => Math.max(current - 1, 0))
        return
      }
      if (event.key !== 'Tab') return

      const elements = focusable()
      if (elements.length === 0) return
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [open, step, phase, slides.length])

  const goNext = () => {
    if (step === slides.length - 1) finish()
    else setStep((current) => current + 1)
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    pointerStart.current = event.clientX
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (pointerStart.current === null) return
    const distance = event.clientX - pointerStart.current
    pointerStart.current = null
    if (Math.abs(distance) < 55) return
    if (distance < 0) goNext()
    else setStep((current) => Math.max(current - 1, 0))
  }

  const onDialogKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' && event.target === event.currentTarget) goNext()
  }

  if (!open) return null

  const slide = slides[step]
  const isLast = step === slides.length - 1

  return (
    <div className="guest-guide" role="presentation">
      <section
        ref={dialogRef}
        className={`guest-guide__dialog guest-guide__dialog--${phase}`}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-guide-title"
        aria-describedby="guest-guide-description"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { pointerStart.current = null }}
        onKeyDown={onDialogKeyDown}
      >
        <div className="guest-guide__preview" aria-hidden="true">
          <div className="guest-guide__demo-stage" key={slide.visual}>
            <GuestGuideVisual visual={slide.visual} />
          </div>
        </div>

        <div className="guest-guide__content">
          <div className="guest-guide__topline">
            <span className="guest-guide__counter">{step + 1} / {slides.length}</span>
            {!isLast ? (
              <button type="button" className="guest-guide__skip" onClick={finish}>Passer</button>
            ) : <span aria-hidden="true" />}
          </div>

          <div className="guest-guide__copy" key={`copy-${slide.visual}`}>
            <p className="guest-guide__eyebrow">{slide.eyebrow}</p>
            <h2 id="guest-guide-title">{slide.title}</h2>
            <p id="guest-guide-description">{slide.body}</p>
          </div>

          <div className="guest-guide__dots" aria-label={`Étape ${step + 1} sur ${slides.length}`}>
            {slides.map((item, index) => (
              <button
                type="button"
                key={item.eyebrow}
                className={index === step ? 'is-active' : ''}
                aria-label={`Aller à l'étape ${index + 1} : ${item.eyebrow}`}
                aria-current={index === step ? 'step' : undefined}
                onClick={() => setStep(index)}
              />
            ))}
          </div>

          <div className="guest-guide__actions">
            {step > 0 ? (
              <button type="button" className="guest-guide__back" onClick={() => setStep((current) => current - 1)}>
                Retour
              </button>
            ) : <span />}
            <button type="button" className="guest-guide__next" onClick={goNext}>
              {isLast ? "C'est parti" : 'Suivant'} <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

export default GuestWelcomeGuide
