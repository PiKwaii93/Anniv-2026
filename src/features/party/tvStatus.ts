const labels: Record<string, string> = { room: 'La Salle', photos: 'Photos', 'beer-pong': 'Beer Pong', missions: 'Missions secrètes', bingo: 'Bingo', iceberg: 'Iceberg', guests: 'Invités' }
export function tvStatus(phase: string, featured: string | null, roomPhase: string | undefined, announcement: boolean) {
  const selected = featured ? labels[featured] ?? 'Accueil' : phase === 'live' ? 'Rotation automatique' : 'Accueil'
  const roomActive = roomPhase === 'open' || roomPhase === 'revealed'
  const base = phase === 'ended' ? 'Générique / palmarès' : roomActive ? 'La Salle' : selected
  return { current: announcement ? 'Annonce en cours' : base, next: announcement ? base : phase !== 'ended' && roomActive && selected !== 'La Salle' ? selected : null }
}
