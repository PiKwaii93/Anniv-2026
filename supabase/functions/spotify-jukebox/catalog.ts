export type TrackChoice = { id: string; title: string; artists: string; album: string; duration_ms: number; url: string }
type CatalogTrack = { id?: string; name?: string; artists?: { name?: string }[]; album?: { name?: string }; duration_ms?: number; is_playable?: boolean; is_local?: boolean }

export function normalizeMusicText(value: string) {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

export function rankTrackChoices(items: CatalogTrack[], title: string, artist: string) {
  const wantedTitle = normalizeMusicText(title)
  const artistWords = normalizeMusicText(artist).split(' ').filter(Boolean)
  const queryWords = new Set(normalizeMusicText(`${title} ${artist}`).split(' ').filter(Boolean))
  const seen = new Set<string>()
  const ranked = items.flatMap((track) => {
    if (!track || !/^[a-zA-Z0-9]{22}$/.test(track.id ?? '') || !track.name || track.is_playable === false || track.is_local) return []
    const artists = (track.artists ?? []).map((entry) => entry.name ?? '').filter(Boolean).join(', ')
    if (!artists) return []
    const normalizedTitle = normalizeMusicText(track.name)
    const normalizedArtists = normalizeMusicText(artists)
    // The same recording often appears on several albums. Keep one identical
    // title/artist pair, but retain live/remix/cover versions as distinct choices.
    const key = `${normalizedTitle}|${normalizedArtists}`
    if (seen.has(key)) return []
    seen.add(key)
    const exactTitle = normalizedTitle === wantedTitle
    const artistTokens = new Set(normalizedArtists.split(' '))
    const artistMatches = artistWords.every((word) => artistTokens.has(word))
    const words = new Set(`${normalizedTitle} ${normalizedArtists}`.split(' '))
    const overlap = [...queryWords].filter((word) => words.has(word)).length / Math.max(queryWords.size, 1)
    const choice: TrackChoice = { id: track.id!, title: track.name, artists, album: track.album?.name ?? '', duration_ms: track.duration_ms ?? 0, url: `https://open.spotify.com/track/${track.id}` }
    return [{ choice, confident: exactTitle && artistMatches, score: (exactTitle ? 100 : 0) + (artistWords.length && artistMatches ? 50 : 0) + overlap * 20 }]
  }).sort((a, b) => b.score - a.score)
  const confident = ranked.filter((item) => item.confident)
  return { choices: ranked.slice(0, 5).map((item) => item.choice), automatic: confident.length === 1 ? confident[0].choice : null }
}
