import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'

import './AvatarCropDialog.css'

const OUTPUT_SIZE = 512

type Position = {
  x: number
  y: number
}

type ImageSize = {
  width: number
  height: number
}

type AvatarCropDialogProps = {
  file: File
  name: string
  onCancel: () => void
  onConfirm: (file: File) => void
}

function clampPosition(
  position: Position,
  image: ImageSize,
  viewportSize: number,
  zoom: number,
) {
  if (!image.width || !image.height || !viewportSize) {
    return { x: 0, y: 0 }
  }

  const scale = Math.max(
    viewportSize / image.width,
    viewportSize / image.height,
  ) * zoom
  const maxX = Math.max(0, (image.width * scale - viewportSize) / 2)
  const maxY = Math.max(0, (image.height * scale - viewportSize) / 2)

  return {
    x: Math.max(-maxX, Math.min(maxX, position.x)),
    y: Math.max(-maxY, Math.min(maxY, position.y)),
  }
}

function AvatarCropDialog({
  file,
  name,
  onCancel,
  onConfirm,
}: AvatarCropDialogProps) {
  const imageRef = useRef<HTMLImageElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    position: Position
  } | null>(null)
  const [sourceUrl] = useState(() => URL.createObjectURL(file))
  const [imageSize, setImageSize] = useState<ImageSize>({ width: 0, height: 0 })
  const [viewportSize, setViewportSize] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 })
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    return () => URL.revokeObjectURL(sourceUrl)
  }, [sourceUrl])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  const displayScale = imageSize.width && imageSize.height && viewportSize
    ? Math.max(
        viewportSize / imageSize.width,
        viewportSize / imageSize.height,
      ) * zoom
    : 1

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!imageSize.width) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      position,
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setPosition(clampPosition({
      x: drag.position.x + event.clientX - drag.startX,
      y: drag.position.y + event.clientY - drag.startY,
    }, imageSize, viewportSize, zoom))
  }

  const stopDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null
    }
  }

  const changeZoom = (nextZoom: number) => {
    setZoom(nextZoom)
    setPosition((current) => clampPosition(
      current,
      imageSize,
      viewportSize,
      nextZoom,
    ))
  }

  const confirmCrop = async () => {
    const image = imageRef.current
    if (!image || !imageSize.width || !viewportSize) return

    setWorking(true)
    setError('')

    const scale = Math.max(
      viewportSize / imageSize.width,
      viewportSize / imageSize.height,
    ) * zoom
    const sourceSize = viewportSize / scale
    const sourceX = (imageSize.width - sourceSize) / 2 - position.x / scale
    const sourceY = (imageSize.height - sourceSize) / 2 - position.y / scale
    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT_SIZE
    canvas.height = OUTPUT_SIZE
    const context = canvas.getContext('2d')

    if (!context) {
      setError('Le cadrage n’a pas pu être préparé.')
      setWorking(false)
      return
    }

    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      OUTPUT_SIZE,
      OUTPUT_SIZE,
    )

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', 0.9)
    })

    if (!blob) {
      setError('La photo cadrée n’a pas pu être créée.')
      setWorking(false)
      return
    }

    onConfirm(new File([blob], 'avatar.webp', { type: 'image/webp' }))
  }

  return createPortal(
    <div
      className="avatar-crop-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !working) onCancel()
      }}
    >
      <section
        className="avatar-crop-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-crop-title"
        tabIndex={-1}
        autoFocus
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !working) onCancel()
        }}
      >
        <header>
          <div>
            <small>PHOTO DE PROFIL</small>
            <h2 id="avatar-crop-title">Cadrer la photo de {name}</h2>
          </div>
          <button type="button" aria-label="Annuler le cadrage" disabled={working} onClick={onCancel}>×</button>
        </header>

        <div
          ref={viewportRef}
          className="avatar-crop-viewport"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
        >
          {sourceUrl && (
            <img
              ref={imageRef}
              src={sourceUrl}
              alt="Aperçu à cadrer"
              draggable={false}
              style={{
                width: imageSize.width * displayScale,
                height: imageSize.height * displayScale,
                transform: `translate(-50%, -50%) translate(${position.x}px, ${position.y}px)`,
              }}
              onLoad={(event) => {
                setViewportSize(viewportRef.current?.clientWidth ?? 320)
                setImageSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })
                setPosition({ x: 0, y: 0 })
              }}
              onError={() => setError('Cette image ne peut pas être ouverte.')}
            />
          )}
          <div className="avatar-crop-mask" aria-hidden="true" />
        </div>

        <p className="avatar-crop-instruction">
          Déplace la photo pour choisir le cadrage.
        </p>

        <label className="avatar-crop-zoom">
          <span>Zoom</span>
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={zoom}
            disabled={working || !imageSize.width}
            onChange={(event) => changeZoom(Number(event.target.value))}
          />
        </label>

        {error && <p className="avatar-crop-error" role="alert">{error}</p>}

        <footer>
          <button type="button" disabled={working} onClick={onCancel}>Annuler</button>
          <button
            type="button"
            className="avatar-crop-confirm"
            disabled={working || !imageSize.width || Boolean(error)}
            onClick={() => void confirmCrop()}
          >
            {working ? 'Préparation…' : 'Utiliser cette photo'}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}

export default AvatarCropDialog
