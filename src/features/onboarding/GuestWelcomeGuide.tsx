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
} from './guestGuideState'
import './GuestWelcomeGuide.css'

type GuestWelcomeGuideProps = {
  enabled: boolean
}

type GuideVisual = 'home' | 'games' | 'photos' | 'music'

const slides: Array<{
  visual: GuideVisual
  eyebrow: string
  title: string
  body: string
}> = [
  {
    visual: 'home',
    eyebrow: 'Bienvenue',
    title: 'Toute la soirée, ici.',
    body: "Jeux, photos, musique et infos utiles : tout est accessible depuis l'accueil.",
  },
  {
    visual: 'games',
    eyebrow: 'Jouer',
    title: 'Participe à ton rythme.',
    body: 'Vote, missions, bingo ou Beer Pong : choisis ce qui te tente.',
  },
  {
    visual: 'photos',
    eyebrow: 'Photos',
    title: 'Capture la soirée.',
    body: 'Relève un défi, publie ta photo et retrouve les souvenirs de la soirée.',
  },
  {
    visual: 'music',
    eyebrow: 'Musique',
    title: 'Ajoute ton morceau.',
    body: 'Recherche un titre, ajoute-le à la soirée et découvre la sélection des invités.',
  },
]

function GuestGuideVisual({ visual }: { visual: GuideVisual }) {
  if (visual === 'home') {
    return (
      <div className="guest-guide-demo guest-guide-demo--home">
        <p className="guest-guide-demo__brand">ANNIV <span>2026</span></p>
        <article className="guest-guide-demo__hero">
          <small>Maintenant</small>
          <strong>La soirée est à toi.</strong>
          <span>Participe à ton rythme.</span>
        </article>
        <div className="guest-guide-demo__shortcuts">
          <div><i>i</i><b>Infos pratiques</b><span>→</span></div>
          <div><i>●</i><b>Discussion</b><span>→</span></div>
          <div><i>○</i><b>Invités</b><span>→</span></div>
        </div>
      </div>
    )
  }

  if (visual === 'games') {
    return (
      <div className="guest-guide-demo guest-guide-demo--games">
        <p className="guest-guide-demo__section-label">À ton rythme</p>
        <div className="guest-guide-demo__game-list">
          <article className="is-live">
            <i>◉</i><span><strong>La Salle</strong><small>Vote avec tout le monde.</small></span><b>→</b>
          </article>
          <article>
            <i>◇</i><span><strong>Missions secrètes</strong><small>Un objectif à accomplir discrètement.</small></span><b>→</b>
          </article>
          <article className="is-peeking">
            <i>▦</i><span><strong>Bingo</strong><small>Observe et coche les scènes.</small></span><b>→</b>
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
        <div className="guest-guide-demo__tabs">
          <b>Défis</b><span>Galerie</span><span>Mes photos</span>
        </div>
        <article className="guest-guide-demo__challenge">
          <small>01</small>
          <strong>Prends la photo la plus cinématographique possible de la soirée.</strong>
          <span>Faire ce défi →</span>
        </article>
      </div>
    )
  }

  return (
    <div className="guest-guide-demo guest-guide-demo--music">
      <p className="guest-guide-demo__music-label">La musique</p>
      <h3>On met quoi ?</h3>
      <div className="guest-guide-demo__tabs guest-guide-demo__tabs--music">
        <b>Ajouter un morceau</b><span>La sélection</span>
      </div>
      <article className="guest-guide-demo__field">
        <small>Titre</small>
        <span>Le morceau qui fait lever tout le monde</span>
      </article>
    </div>
  )
}

export function GuestWelcomeGuide({ enabled }: GuestWelcomeGuideProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const pointerStart = useRef<number | null>(null)
  const dialogRef = useRef<HTMLElement | null>(null)

  const finish = () => {
    completeGuestGuide()
    setOpen(false)
  }

  useEffect(() => {
    if (!enabled || hasCompletedGuestGuide()) return
    const timer = window.setTimeout(() => {
      setStep(0)
      setOpen(true)
    }, 260)
    return () => window.clearTimeout(timer)
  }, [enabled])

  useEffect(() => {
    const replay = () => {
      if (!enabled) return
      setStep(0)
      setOpen(true)
    }
    window.addEventListener(GUEST_GUIDE_REPLAY_EVENT, replay)
    return () => window.removeEventListener(GUEST_GUIDE_REPLAY_EVENT, replay)
  }, [enabled])

  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    document.body.style.overflow = 'hidden'

    const focusable = () =>
      Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [])

    const focusFrame = window.requestAnimationFrame(() => focusable().at(-1)?.focus())
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
  }, [open, step])

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
        className="guest-guide__dialog"
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
