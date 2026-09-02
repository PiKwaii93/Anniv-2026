import type { HallOfFameData } from '../hallOfFame/hallOfFame'
import type { HallPhoto } from '../hallOfFame/highlights'

export type CreditsSlide = { id: string; title: string; subtitle?: string; names?: string[]; photos?: HallPhoto[] }
export type CreditsVisibility = { guestsVisible: boolean; photosVisible: boolean; missionsVisible: boolean; roomVisible: boolean; beerPongVisible: boolean }

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size))
  return result
}

export function buildCredits(names: string[], hall: HallOfFameData, visible: CreditsVisibility, champions: string[]): CreditsSlide[] {
  const slides: CreditsSlide[] = [{ id: 'intro', title: 'C’était nous.', subtitle: 'Anniv 2026 · Merci pour cette soirée.' }]
  if (visible.guestsVisible) chunks(names, 12).forEach((group, i) => slides.push({ id: `guests-${i}`, title: 'Au générique', subtitle: 'Les invités de cette édition', names: group }))
  if (visible.photosVisible && hall.photos) chunks(hall.photos.memories.filter((photo) => photo.status === 'approved'), 4).forEach((photos, i) => slides.push({ id: `photos-${i}`, title: 'Des souvenirs plein la tête.', photos }))
  const awards = (id: string, title: string, rows: { name: string; score: number }[]) => {
    const top = Math.max(0, ...rows.map((row) => row.score))
    if (top > 0) chunks(rows.filter((row) => row.score === top).map((row) => row.name), 8).forEach((group, i) => slides.push({ id: `${id}-${i}`, title, subtitle: group.length > 1 ? 'À égalité en tête' : 'Bravo !', names: group }))
  }
  if (visible.beerPongVisible && champions.length) slides.push({ id: 'beer-pong', title: 'Champions du Beer Pong', names: champions })
  if (visible.missionsVisible) awards('missions', 'Les agents de la soirée', hall.missions.ranking)
  if (visible.roomVisible) awards('room', 'Les mentalistes de La Salle', hall.room.ranking)
  if (visible.photosVisible && hall.photos) awards('photographers', 'Les photographes de la soirée', hall.photos.ranking)
  slides.push({ id: 'outro', title: 'Merci d’avoir été là.', subtitle: 'La soirée se termine. Les souvenirs restent.' })
  return slides
}
