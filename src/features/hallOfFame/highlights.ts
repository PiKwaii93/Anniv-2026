import type { HallRankingRow } from './hallOfFame'

export type HallPhoto = {
  id: string
  player_key: string
  player_name: string
  storage_path: string
  caption: string | null
  status: string
}

export type HallPhotoSummary = {
  published: number
  photographers: number
  ranking: HallRankingRow[]
  memories: HallPhoto[]
}

export function positiveRanking(rows: HallRankingRow[]) {
  return rows.filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'fr'))
}

export function hallLeaders(rows: HallRankingRow[]) {
  const ranked = positiveRanking(rows)
  return ranked.filter((row) => row.score === ranked[0]?.score)
}

export function hallRank(rows: HallRankingRow[], score: number) {
  return 1 + rows.filter((row) => row.score > score).length
}

export function summarizeHallPhotos(rows: HallPhoto[]): HallPhotoSummary {
  // An admin can read private submissions too: keep the public filter here as well.
  const approved = [...new Map(rows.filter((row) => row.status === 'approved')
    .map((row) => [row.id, row])).values()]
  const players = new Map<string, HallPhoto[]>()
  approved.forEach((row) => {
    const photos = players.get(row.player_key) ?? []
    photos.push(row)
    players.set(row.player_key, photos)
  })
  const ranking = positiveRanking([...players.values()].map((photos) => ({
    name: photos[0].player_name,
    score: photos.length,
  })))
  // Take turns between photographers, so the souvenir wall celebrates everyone.
  const memories: HallPhoto[] = []
  for (let index = 0; memories.length < Math.min(12, approved.length); index += 1) {
    for (const photos of players.values()) {
      if (photos[index] && memories.length < 12) memories.push(photos[index])
    }
  }
  return { published: approved.length, photographers: players.size, ranking, memories }
}
