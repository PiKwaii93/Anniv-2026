import type { PhotoHuntSubmission } from './photoHunt'

export function buildPhotoPages(photos: PhotoHuntSubmission[]) {
  return photos.map((photo) => [photo])
}
