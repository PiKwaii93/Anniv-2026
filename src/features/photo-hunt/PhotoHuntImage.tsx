import {
  useEffect,
  useState,
} from 'react'

import { supabase } from '../../lib/supabase'

type PhotoHuntImageProps = {
  path: string
  alt: string
  className?: string
  framed?: boolean
  onOrientation?: (orientation: 'portrait' | 'landscape' | 'square') => void
}

function PhotoHuntImageForPath({
  path,
  alt,
  className,
  framed = false,
  onOrientation,
}: PhotoHuntImageProps) {
  const [url, setUrl] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let objectUrl = ''

    const load = async () => {
      const { data, error } = await supabase.storage
        .from('photo-hunt')
        .download(path)

      if (cancelled) return

      if (error || !data) {
        console.error('Unable to download Photo Hunt image:', error)
        setFailed(true)
        return
      }

      objectUrl = URL.createObjectURL(data)
      setUrl(objectUrl)
    }

    void load()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [path])

  if (failed) {
    return (
      <div className={className} role="img" aria-label={alt}>
        <span>Photo indisponible</span>
      </div>
    )
  }

  if (!url) {
    return (
      <div className={className} aria-hidden="true">
        <span>Chargement…</span>
      </div>
    )
  }

  const image = (
    <img
      src={url}
      alt={alt}
      className={framed ? 'photo-hunt-image__foreground' : className}
      loading="lazy"
      decoding="async"
      onLoad={(event) => {
        const { naturalWidth, naturalHeight } = event.currentTarget
        const ratio = naturalWidth / naturalHeight
        onOrientation?.(ratio < 0.86 ? 'portrait' : ratio > 1.16 ? 'landscape' : 'square')
      }}
    />
  )

  if (!framed) return image

  return (
    <div className={className}>
      <span
        className="photo-hunt-image__backdrop"
        style={{ backgroundImage: `url("${url}")` }}
        aria-hidden="true"
      />
      {image}
    </div>
  )
}

function PhotoHuntImage(props: PhotoHuntImageProps) {
  return <PhotoHuntImageForPath key={props.path} {...props} />
}

export default PhotoHuntImage
