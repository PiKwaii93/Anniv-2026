import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export const PHOTO_HUNT_SUBMISSIONS_BUCKET = 'photo-hunt'

export type PhotoHuntImageOrientation = 'portrait' | 'landscape' | 'square'

type PhotoHuntImageProps = {
  storagePath?: string
  path?: string
  alt: string
  className?: string
  framed?: boolean
  onOrientation?: (orientation: PhotoHuntImageOrientation) => void
  onNaturalSize?: (width: number, height: number) => void
  debugLayout?: boolean
}

function getImageOrientation(width: number, height: number): PhotoHuntImageOrientation {
  if (Math.abs(width - height) / Math.max(width, height) < 0.05) return 'square'
  return width > height ? 'landscape' : 'portrait'
}

export function PhotoHuntImage({
  storagePath,
  path,
  alt,
  className = '',
  framed = false,
  onOrientation,
  onNaturalSize,
  debugLayout = false,
}: PhotoHuntImageProps) {
  const resolvedPath = storagePath ?? path ?? ''
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    let objectUrl: string | null = null

    setUrl(null)
    setFailed(false)
    if (!supabase.storage?.from) return undefined

    void supabase.storage
      .from(PHOTO_HUNT_SUBMISSIONS_BUCKET)
      .download(resolvedPath)
      .then(({ data, error }) => {
        if (!active) return
        if (error || !data) {
          console.error('[PhotoHunt][IMAGE_DOWNLOAD_ERROR]', { storagePath: resolvedPath, message: error?.message })
          setFailed(true)
          return
        }
        objectUrl = URL.createObjectURL(data)
        setUrl(objectUrl)
      })

    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [resolvedPath])

  const classes = `${className}${framed ? ' photo-hunt-image--framed' : ''}`.trim()
  if (failed) return <div className={`${classes} photo-hunt-image--failed`} role="img" aria-label={alt} />
  if (!url) return <div className={`${classes} photo-hunt-image--loading`} aria-hidden="true" />

  return (
    <img
      src={url}
      alt={alt}
      className={classes}
      loading="lazy"
      decoding="async"
      onLoad={(event) => {
        const width = event.currentTarget.naturalWidth
        const height = event.currentTarget.naturalHeight
        const orientation = getImageOrientation(width, height)
        onOrientation?.(orientation)
        onNaturalSize?.(width, height)
        if (debugLayout) {
          console.debug('[PhotoHunt][IMAGE_LAYOUT]', {
            storagePath: resolvedPath,
            naturalWidth: width,
            naturalHeight: height,
            aspectRatio: width / height,
            orientation,
          })
        }
      }}
      onError={() => setFailed(true)}
    />
  )
}

export default PhotoHuntImage
