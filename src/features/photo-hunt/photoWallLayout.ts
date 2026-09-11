import type { PhotoHuntSubmission } from './photoHunt'

export const PHOTO_WALL_PAGE_SIZE = 6

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

  let bestSplit = 1
  let smallestDifference = Number.POSITIVE_INFINITY

  for (let split = 1; split < photos.length; split += 1) {
    const firstRatio = photos
      .slice(0, split)
      .reduce((total, photo) => total + getPhotoAspectRatio(photo), 0)
    const secondRatio = photos
      .slice(split)
      .reduce((total, photo) => total + getPhotoAspectRatio(photo), 0)
    const difference = Math.abs(firstRatio - secondRatio)
    if (difference < smallestDifference) {
      bestSplit = split
      smallestDifference = difference
    }
  }

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
  const pages: PhotoHuntSubmission[][] = []
  for (let index = 0; index < photos.length; index += PHOTO_WALL_PAGE_SIZE) {
    pages.push(photos.slice(index, index + PHOTO_WALL_PAGE_SIZE))
  }
  return pages
}
