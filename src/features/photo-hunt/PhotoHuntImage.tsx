import {
  useEffect,
  useState,
} from 'react'

import { supabase } from '../../lib/supabase'

type PhotoHuntImageProps = {
  path: string
  alt: string
  className?: string
}

function PhotoHuntImage({
  path,
  alt,
  className,
}: PhotoHuntImageProps) {
  const [url, setUrl] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let objectUrl = ''

    setUrl('')
    setFailed(false)

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

  return (
    <img
      src={url}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
    />
  )
}

export default PhotoHuntImage
