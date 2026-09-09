import { useMemo, useState } from 'react'

import { supabase } from '../../lib/supabase'

import './GuestAvatar.css'

type GuestAvatarProps = {
  name: string
  path?: string | null
  size?: 'small' | 'medium' | 'large'
  className?: string
}

function GuestAvatar({
  name,
  path,
  size = 'medium',
  className = '',
}: GuestAvatarProps) {
  const [failedPath, setFailedPath] = useState<string | null>(null)
  const url = useMemo(() => {
    if (!path) return ''
    return supabase.storage
      .from('guest-avatars')
      .getPublicUrl(path).data.publicUrl
  }, [path])
  const showImage = Boolean(url && failedPath !== path)
  const initial = name.trim().charAt(0).toUpperCase() || '?'

  return (
    <span
      className={`guest-profile-avatar guest-profile-avatar--${size} ${className}`.trim()}
      aria-hidden="true"
    >
      {showImage ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailedPath(path ?? null)}
        />
      ) : initial}
    </span>
  )
}

export default GuestAvatar
