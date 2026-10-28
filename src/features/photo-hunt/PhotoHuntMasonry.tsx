import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { PhotoHuntChallenge, PhotoHuntSubmission } from './photoHunt'
import PhotoHuntImage from './PhotoHuntImage'
import {
  advanceAutoScroll,
  calculateMasonryLayout,
  getPhotoAspectRatio,
  getVisibleMasonryItems,
} from './photoWallLayout'

const AUTO_SCROLL_PX_PER_SECOND = 28
const VIRTUALIZATION_BUFFER_SCREENS = 1.5
const VIRTUAL_WINDOW_UPDATE_PX = 32
const LOOP_END_PAUSE_MS = 4000
const LOOP_FADE_MS = 260

type PhotoHuntMasonryProps = {
  photos: PhotoHuntSubmission[]
  challengeById: Map<string, PhotoHuntChallenge>
  paused?: boolean
}

type PendingAnchor = { id: string; offset: number }

export function PhotoHuntMasonry({ photos, challengeById, paused = false }: PhotoHuntMasonryProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const layoutRef = useRef<ReturnType<typeof calculateMasonryLayout>>({
    columnCount: 0,
    columnWidth: 0,
    height: 0,
    items: [],
  })
  const scrollTopRef = useRef(0)
  const publishedScrollTopRef = useRef(0)
  const pendingAnchorRef = useRef<PendingAnchor | null>(null)
  const bottomReachedAtRef = useRef<number | null>(null)
  const resetPhaseRef = useRef<'idle' | 'fade-out' | 'fade-in'>('idle')
  const resetPhaseStartedAtRef = useRef(0)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [virtualScrollTop, setVirtualScrollTop] = useState(0)
  const [naturalRatios, setNaturalRatios] = useState<Record<string, number>>({})
  const [isLoopResetting, setIsLoopResetting] = useState(false)

  useEffect(() => {
    if (paused) return

    const viewport = viewportRef.current
    if (!viewport) return undefined

    const measure = () => {
      const rect = viewport.getBoundingClientRect()
      setViewportSize((current) => {
        const next = {
          width: Math.round(rect.width) || 1200,
          height: Math.round(rect.height) || 720,
        }
        if (current.width === next.width && current.height === next.height) return current

        const scrollTop = scrollTopRef.current
        const anchor = layoutRef.current.items.find((item) => item.y + item.height >= scrollTop)
        if (anchor) pendingAnchorRef.current = { id: anchor.id, offset: scrollTop - anchor.y }
        return next
      })
    }

    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [paused])

  const masonryPhotos = useMemo(
    () => photos.map((photo) => ({
      id: photo.id,
      aspectRatio: naturalRatios[photo.id]
        ?? getPhotoAspectRatio(photo.image_width, photo.image_height),
    })),
    [naturalRatios, photos],
  )

  const layout = useMemo(
    () => calculateMasonryLayout(masonryPhotos, viewportSize.width),
    [masonryPhotos, viewportSize.width],
  )

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const pendingAnchor = pendingAnchorRef.current
    if (viewport && pendingAnchor) {
      const anchoredItem = layout.items.find((item) => item.id === pendingAnchor.id)
      if (anchoredItem) {
        const maxScroll = Math.max(0, layout.height - viewport.clientHeight)
        const nextScrollTop = Math.max(0, Math.min(maxScroll, anchoredItem.y + pendingAnchor.offset))
        viewport.scrollTop = nextScrollTop
        scrollTopRef.current = nextScrollTop
        publishedScrollTopRef.current = nextScrollTop
        setVirtualScrollTop(nextScrollTop)
      }
      pendingAnchorRef.current = null
    }
    layoutRef.current = layout
  }, [layout])

  useEffect(() => {
    let frame = 0
    let timeout = 0
    let previousTime = performance.now()

    const requestFrame = (callback: FrameRequestCallback) => {
      if (typeof window.requestAnimationFrame === 'function') {
        frame = window.requestAnimationFrame(callback)
      } else {
        timeout = window.setTimeout(() => callback(performance.now()), 16)
      }
    }

    const tick = (time: number) => {
      const viewport = viewportRef.current
      const elapsedMs = Math.min(100, Math.max(0, time - previousTime))
      previousTime = time

      if (viewport) {
        const maxScroll = Math.max(0, layoutRef.current.height - viewport.clientHeight)
        const resetPhase = resetPhaseRef.current

        if (resetPhase === 'fade-out') {
          if (time - resetPhaseStartedAtRef.current >= LOOP_FADE_MS) {
            viewport.scrollTop = 0
            scrollTopRef.current = 0
            publishedScrollTopRef.current = 0
            setVirtualScrollTop(0)
            resetPhaseRef.current = 'fade-in'
            resetPhaseStartedAtRef.current = time
          }
        } else if (resetPhase === 'fade-in') {
          if (time - resetPhaseStartedAtRef.current >= 50) {
            setIsLoopResetting(false)
            resetPhaseRef.current = 'idle'
          }
        } else if (scrollTopRef.current < maxScroll) {
          bottomReachedAtRef.current = null
          const next = advanceAutoScroll(
            scrollTopRef.current,
            layoutRef.current.height,
            viewport.clientHeight,
            elapsedMs,
            AUTO_SCROLL_PX_PER_SECOND,
          )
          scrollTopRef.current = next
          viewport.scrollTop = next

          if (Math.abs(next - publishedScrollTopRef.current) >= VIRTUAL_WINDOW_UPDATE_PX) {
            publishedScrollTopRef.current = next
            setVirtualScrollTop(next)
          }
        } else if (maxScroll > 0) {
          if (bottomReachedAtRef.current === null) {
            bottomReachedAtRef.current = time
          } else if (time - bottomReachedAtRef.current >= LOOP_END_PAUSE_MS) {
            bottomReachedAtRef.current = null
            resetPhaseRef.current = 'fade-out'
            resetPhaseStartedAtRef.current = time
            setIsLoopResetting(true)
          }
        }
      }

      requestFrame(tick)
    }

    requestFrame(tick)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      if (timeout) window.clearTimeout(timeout)
    }
  }, [])

  const reportNaturalSize = useCallback((photoId: string, width: number, height: number) => {
    if (width <= 0 || height <= 0) return
    const ratio = width / height
    if (!Number.isFinite(ratio)) return

    setNaturalRatios((current) => {
      if (Math.abs((current[photoId] ?? 0) - ratio) < 0.001) return current

      const currentLayout = layoutRef.current
      const scrollTop = scrollTopRef.current
      const anchor = currentLayout.items.find((item) => item.y + item.height >= scrollTop)
      if (anchor) pendingAnchorRef.current = { id: anchor.id, offset: scrollTop - anchor.y }
      return { ...current, [photoId]: ratio }
    })
  }, [])

  const verticalOffset = Math.max(0, (viewportSize.height - layout.height) / 2)
  const visibleItems = useMemo(
    () => getVisibleMasonryItems(
      layout.items,
      Math.max(0, virtualScrollTop - verticalOffset),
      viewportSize.height,
      VIRTUALIZATION_BUFFER_SCREENS,
    ),
    [layout.items, verticalOffset, viewportSize.height, virtualScrollTop],
  )
  const photoById = useMemo(() => new Map(photos.map((photo) => [photo.id, photo])), [photos])
  const canvasHeight = Math.max(viewportSize.height, layout.height + verticalOffset * 2)

  return (
    <div
      ref={viewportRef}
      className={`photo-hunt-masonry${isLoopResetting ? ' photo-hunt-masonry--resetting' : ''}`}
      aria-label="Mur de photos en direct"
    >
      <div className="photo-hunt-masonry__canvas" style={{ height: canvasHeight }}>
        {visibleItems.map((item) => {
          const photo = photoById.get(item.id)
          if (!photo) return null
          const challenge = photo.challenge_id ? challengeById.get(photo.challenge_id) : null
          const style = {
            '--photo-image-height': `${item.imageHeight}px`,
            left: item.x,
            top: item.y + verticalOffset,
            width: item.width,
            height: item.height,
          } as CSSProperties

          return (
            <article key={photo.id} className="photo-hunt-masonry__photo" data-photo-id={photo.id} style={style}>
              <PhotoHuntImage
                storagePath={photo.storage_path}
                alt={`Photo de ${photo.player_name}`}
                className="photo-hunt-masonry__image"
                debugLayout
                onNaturalSize={(width, height) => reportNaturalSize(photo.id, width, height)}
              />
              <strong className="photo-hunt-masonry__author">{photo.player_name}</strong>
              <span className="photo-hunt-masonry__caption">
                {challenge?.prompt ?? 'Souvenir partagé pendant la soirée.'}
              </span>
            </article>
          )
        })}
      </div>
    </div>
  )
}

export const PHOTO_HUNT_SCROLL_SPEED = AUTO_SCROLL_PX_PER_SECOND
