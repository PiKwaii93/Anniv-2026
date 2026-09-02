export type Letter = { player_name: string; message: string; memory: string; prediction: string; updated_at: string }
export type SongStatus = 'pending' | 'queued' | 'playing' | 'played' | 'rejected'
export type Song = { id: string; title: string; artist: string; link: string; status: SongStatus; player_name: string; mine: boolean; votes: number; voted: boolean }
export type ExtrasSettings = {
  capsule_visible: boolean; capsule_open: boolean; capsule_reveal_at: string
  jukebox_visible: boolean; jukebox_open: boolean
  duos_visible: boolean; duos_open: boolean
  credits_enabled: boolean; credits_run: string
}
export type ExtrasState = {
  settings: ExtrasSettings
  phase: 'preparation' | 'live' | 'ended'
  ending_key: string
  capsule: { own: Letter | null; count: number; revealed: boolean; entries: Letter[] }
  songs: Song[]; song_count: number
  duo: null | { id: string; partner: string; prompt: string; status: 'active' | 'completed' | 'skipped'; confirmed: boolean; partner_confirmed: boolean }
  duo_attempts: number; waiting: boolean
  duo_stats: { waiting: number; completed: number }
  credits_names: string[]
}

export const songStatus: Record<SongStatus, string> = {
  pending: 'En validation · privée', queued: 'Dans la sélection', playing: 'Choisie par la régie', played: 'Déjà passée', rejected: 'Non retenue',
}

const musicHosts = new Set(['open.spotify.com', 'www.youtube.com', 'youtube.com', 'youtu.be', 'music.youtube.com', 'music.apple.com', 'www.deezer.com', 'deezer.com'])
export function safeMusicLink(link: string): string | null {
  if (!link || link.length > 500 || /\s/.test(link)) return null
  try {
    const url = new URL(link)
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && musicHosts.has(url.hostname) ? url.href : null
  } catch { return null }
}

export function revealDate(value: string) {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(new Date(value))
}

export function songExport(songs: Song[]) {
  return songs.filter((song) => ['queued', 'playing', 'played'].includes(song.status))
    .map((song) => `${song.artist} — ${song.title}\nProposé par ${song.player_name} · ${song.votes} vote(s) · ${songStatus[song.status]}${safeMusicLink(song.link) ? `\n${song.link}` : ''}`).join('\n\n')
}

export function letterExport(letters: Letter[]) {
  return letters.map((letter) => `${letter.player_name}\n${'—'.repeat(24)}\nMessage : ${letter.message || '—'}\nSouvenir : ${letter.memory || '—'}\nPrédiction : ${letter.prediction || '—'}`).join('\n\n')
}

export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const errors: Record<string, string> = {
  IDENTITY_REQUIRED: 'Ton identification a expiré. Reviens à l’accueil pour choisir ton prénom.',
  NOT_ADMIN: 'Reconnecte-toi à la régie pour continuer.',
  CAPSULE_CLOSED: 'La capsule ne reçoit plus de lettres. Ton brouillon reste ici.',
  JUKEBOX_CLOSED: 'Les propositions et les votes sont fermés pour le moment.',
  SONG_LIMIT: 'Tu as déjà proposé tes trois chansons, y compris celles non retenues.',
  SONG_EXISTS: 'Cette chanson a déjà été proposée. Si elle est publiée, tu peux voter pour elle.',
  INVALID_LINK: 'Utilise un lien HTTPS Spotify, YouTube, Apple Music ou Deezer, ou laisse ce champ vide.',
  INVALID_INPUT: 'Vérifie les champs et leur longueur avant de réessayer.',
  INVALID_TRANSITION: 'Le statut de cette chanson a changé. La liste va se rafraîchir.',
  VOTE_CLOSED: 'Cette chanson n’accepte plus de votes.',
  DUOS_CLOSED: 'Les duos sont ouverts uniquement pendant la soirée, lorsque la régie les active.',
  DUO_LIMIT: 'Tu as reçu tes trois défis pour cette soirée.',
  DUO_NOT_ACTIVE: 'Ce duo n’est plus actif. La page va se rafraîchir.',
  PARTY_NOT_ENDED: 'Choisis d’abord la scène Fin de soirée dans le Directeur.',
  NOT_FOUND: 'Cet élément n’est plus disponible.',
}
export function extrasError(error: unknown) {
  if (error && typeof error === 'object' && 'code' in error && ['23514', '22001', '22P02'].includes(String(error.code))) return errors.INVALID_INPUT
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : ''
  return Object.entries(errors).find(([code]) => message.includes(code))?.[1] ?? 'Connexion interrompue. Réessaie dans quelques instants.'
}
