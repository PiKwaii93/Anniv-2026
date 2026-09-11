import type { PhotoHuntSubmission } from './photoHunt'

export const PHOTO_WALL_PAGE_SIZE = 4

export function buildPhotoPages(photos: PhotoHuntSubmission[]) {
  const pages: PhotoHuntSubmission[][] = []
  for (let index = 0; index < photos.length; index += PHOTO_WALL_PAGE_SIZE) {
    pages.push(photos.slice(index, index + PHOTO_WALL_PAGE_SIZE))
  }
  return pages
}
