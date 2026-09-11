import type { PhotoHuntSubmission } from './photoHunt'

export const PHOTO_WALL_PAGE_SIZE = 4
export const PHOTO_WALL_GAP = 8
export const PHOTO_WALL_CAPTION_HEIGHT = 64

export function calculatePhotoRowWidth({
  wallWidth,
  wallHeight,
  rowRatio,
  photoCount,
  rowCount,
}: {
  wallWidth: number
  wallHeight: number
  rowRatio: number
  photoCount: number
  rowCount: number
}) {
  const verticalGaps = Math.max(0, rowCount - 1) * PHOTO_WALL_GAP
  const captions = rowCount * PHOTO_WALL_CAPTION_HEIGHT
  const availableImageHeight = Math.max(0, wallHeight - verticalGaps - captions)
  const imageHeight = availableImageHeight / Math.max(1, rowCount)
  const horizontalGaps = Math.max(0, photoCount - 1) * PHOTO_WALL_GAP
  return Math.max(0, Math.min(wallWidth, (rowRatio * imageHeight) + horizontalGaps))
}

export function getPhotoAspectRatio(photo: PhotoHuntSubmission) {
  const width = Number(photo.image_width)
  const height = Number(photo.image_height)
  return width > 0 && height > 0 ? width / height : 4 / 3
}

export function buildPhotoRows(photos: PhotoHuntSubmission[]) {
  if (photos.length < 2) {
    return photos.length === 0
      ? []
      : [{ photos, ratio: getPhotoAspectRatio(photos[0]) }]
  }

  const bestSplit = Math.ceil(photos.length / 2)

  const twoRows = [photos.slice(0, bestSplit), photos.slice(bestSplit)].map((rowPhotos) => ({
    photos: rowPhotos,
    ratio: rowPhotos.reduce((total, photo) => total + getPhotoAspectRatio(photo), 0),
  }))

  // Approximate the 16:9 TV space left after the title rail. Choose the layout
  // that displays the largest total photo area without cropping any image.
  const availableWidth = 1.8
  const totalRatio = twoRows[0].ratio + twoRows[1].ratio
  const singleHeight = Math.min(0.68, availableWidth / totalRatio)
  const singleArea = totalRatio * singleHeight ** 2
  const twoRowArea = twoRows.reduce((area, row) => {
    const height = Math.min(0.32, availableWidth / row.ratio)
    return area + row.ratio * height ** 2
  }, 0)

  return singleArea >= twoRowArea
    ? [{ photos, ratio: totalRatio }]
    : twoRows
}

export function buildPhotoPages(photos: PhotoHuntSubmission[]) {
  if (photos.length === 0) return []
  if (photos.length <= PHOTO_WALL_PAGE_SIZE) return [photos]

  const slots = photos.slice(0, PHOTO_WALL_PAGE_SIZE)
  const frames = [slots.slice()]
  const divisor = greatestCommonDivisor(photos.length, PHOTO_WALL_PAGE_SIZE)
  const rotationLength = (photos.length * PHOTO_WALL_PAGE_SIZE) / divisor

  for (let step = 0; step < rotationLength - 1; step += 1) {
    slots[step % PHOTO_WALL_PAGE_SIZE] = photos[(PHOTO_WALL_PAGE_SIZE + step) % photos.length]
    frames.push(slots.slice())
  }

  return frames
}

function greatestCommonDivisor(left: number, right: number): number {
  return right === 0 ? left : greatestCommonDivisor(right, left % right)
}
