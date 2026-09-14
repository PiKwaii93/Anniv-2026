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

const slides = [
  {
    eyebrow: 'Bienvenue',
    title: 'Toute la soirée, ici.',
    body: "Jeux, photos, musique et infos utiles : tout est accessible depuis l'accueil.",
    image: '/onboarding/accueil.svg',
    position: 'top',
  },
  {
    eyebrow: 'Jouer',
    title: 'Participe à ton rythme.',
    body: 'Vote, missions, bingo ou Beer Pong : choisis ce qui te tente.',
    image: '/onboarding/jouer.svg',
    position: 'top',
  },
  {
    eyebrow: 'Photos',
    title: 'Capture la soirée.',
    body: 'Relève un défi, publie ta photo et retrouve les souvenirs de la soirée.',
    image: '/onboarding/photos.svg',
    position: 'top',
  },
  {
    eyebrow: 'Musique',
    title: 'Ajoute ton morceau.',
    body: 'Recherche un titre, ajoute-le à la soirée et découvre la sélection des invités.',
    image: '/onboarding/musique.svg',
    position: 'top',
  },
] as const

export function GuestWelcomeGuide({ enabled }: GuestWelcomeGuideProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const pointerStart = useRef<number | null>(null)
  const dialogRef = useRef<HTMLElement | null>(null)

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

  const finish = () => {
    completeGuestGuide()
    setOpen(false)
  }

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
          <div className="guest-guide__phone">
            <img
              key={slide.image}
              src={slide.image}
              alt=""
              className={`guest-guide__screenshot guest-guide__screenshot--${slide.position}`}
            />
          </div>
        </div>

        <div className="guest-guide__content">
          <div className="guest-guide__topline">
            <span className="guest-guide__counter">{step + 1} / {slides.length}</span>
            {!isLast ? (
              <button type="button" className="guest-guide__skip" onClick={finish}>
                Passer
              </button>
            ) : <span aria-hidden="true" />}
          </div>

          <p className="guest-guide__eyebrow">{slide.eyebrow}</p>
          <h2 id="guest-guide-title">{slide.title}</h2>
          <p id="guest-guide-description">{slide.body}</p>
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
              {isLast ? "C'est parti" : 'Suivant'}
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

export default GuestWelcomeGuide
