export const PHOTO_WALL_GAP = 8
export const PHOTO_WALL_CAPTION_HEIGHT = 64
export const PHOTO_WALL_MIN_COLUMN_WIDTH = 250
export const PHOTO_WALL_MAX_COLUMNS = 4

export type MasonryPhoto = {
  id: string
  aspectRatio: number
}

export type MasonryItem = MasonryPhoto & {
  column: number
  x: number
  y: number
  width: number
  imageHeight: number
  height: number
}

export type MasonryLayout = {
  columnCount: number
  columnWidth: number
  height: number
  items: MasonryItem[]
}

export type MasonryOptions = {
  gap?: number
  captionHeight?: number
  minColumnWidth?: number
  maxColumns?: number
}

export function getPhotoAspectRatio(
  width: number | null | undefined,
  height: number | null | undefined,
) {
  if (!width || !height || width <= 0 || height <= 0) return 4 / 3
  return width / height
}

export function getMasonryColumnCount(
  containerWidth: number,
  photoCount: number,
  minColumnWidth = PHOTO_WALL_MIN_COLUMN_WIDTH,
  maxColumns = PHOTO_WALL_MAX_COLUMNS,
  gap = PHOTO_WALL_GAP,
) {
  if (photoCount <= 0 || containerWidth <= 0) return 0
  const columnsThatFit = Math.max(1, Math.floor((containerWidth + gap) / (minColumnWidth + gap)))
  return Math.min(photoCount, maxColumns, columnsThatFit)
}

/** Computes the complete geometry using the classic shortest-column Masonry rule. */
export function calculateMasonryLayout(
  photos: MasonryPhoto[],
  containerWidth: number,
  options: MasonryOptions = {},
): MasonryLayout {
  const gap = options.gap ?? PHOTO_WALL_GAP
  const captionHeight = options.captionHeight ?? PHOTO_WALL_CAPTION_HEIGHT
  const columnCount = getMasonryColumnCount(
    containerWidth,
    photos.length,
    options.minColumnWidth,
    options.maxColumns,
    gap,
  )

  if (columnCount === 0) {
    return { columnCount: 0, columnWidth: 0, height: 0, items: [] }
  }

  const columnWidth = (containerWidth - gap * (columnCount - 1)) / columnCount
  const columnHeights = Array.from({ length: columnCount }, () => 0)
  const items = photos.map((photo) => {
    const column = columnHeights.indexOf(Math.min(...columnHeights))
    const aspectRatio = Number.isFinite(photo.aspectRatio) && photo.aspectRatio > 0
      ? photo.aspectRatio
      : 4 / 3
    const imageHeight = columnWidth / aspectRatio
    const height = imageHeight + captionHeight
    const item: MasonryItem = {
      ...photo,
      aspectRatio,
      column,
      x: column * (columnWidth + gap),
      y: columnHeights[column],
      width: columnWidth,
      imageHeight,
      height,
    }
    columnHeights[column] += height + gap
    return item
  })

  return {
    columnCount,
    columnWidth,
    height: Math.max(0, Math.max(...columnHeights) - gap),
    items,
  }
}

export function getVisibleMasonryItems(
  items: MasonryItem[],
  scrollTop: number,
  viewportHeight: number,
  bufferScreens = 1.5,
) {
  const buffer = Math.max(0, viewportHeight * bufferScreens)
  const start = scrollTop - buffer
  const end = scrollTop + viewportHeight + buffer
  return items.filter((item) => item.y + item.height >= start && item.y <= end)
}

export function advanceAutoScroll(
  currentScrollTop: number,
  contentHeight: number,
  viewportHeight: number,
  elapsedMs: number,
  pixelsPerSecond: number,
) {
  const maximum = Math.max(0, contentHeight - viewportHeight)
  const distance = Math.max(0, pixelsPerSecond) * Math.max(0, elapsedMs) / 1000
  return Math.min(maximum, Math.max(0, currentScrollTop) + distance)
}
