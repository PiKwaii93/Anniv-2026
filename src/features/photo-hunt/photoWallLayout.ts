import type { PhotoHuntSubmission } from './photoHunt'

export const PHOTO_WALL_CAPACITY = 6

export type PhotoOrientation = 'portrait' | 'landscape' | 'square'

export function orientationFromDimensions(
  width?: number | null,
  height?: number | null,
): PhotoOrientation | null {
  if (!width || !height) return null
  const ratio = width / height
  if (ratio < 0.92) return 'portrait'
  if (ratio > 1.08) return 'landscape'
  return 'square'
}

export function buildPhotoPages(
  photos: PhotoHuntSubmission[],
  orientationByPath: Record<string, PhotoOrientation>,
) {
  const pages: PhotoHuntSubmission[][] = []
  let currentPage: PhotoHuntSubmission[] = []
  let usedCapacity = 0

  photos.forEach((photo) => {
    const orientation = orientationFromDimensions(photo.image_width, photo.image_height)
      ?? orientationByPath[photo.storage_path]
    if (!orientation) return
    const photoCapacity = orientation === 'portrait' ? 2 : 1
    if (currentPage.length > 0 && usedCapacity + photoCapacity > PHOTO_WALL_CAPACITY) {
      pages.push(currentPage)
      currentPage = []
      usedCapacity = 0
    }
    currentPage.push(photo)
    usedCapacity += photoCapacity
  })

  if (currentPage.length > 0) pages.push(currentPage)
  return pages
}
