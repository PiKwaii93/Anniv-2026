import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const layoutModule = await import(new URL('../src/features/photo-hunt/photoWallLayout.ts', import.meta.url))
const { advanceAutoScroll, calculateMasonryLayout, getVisibleMasonryItems } = layoutModule

const photos = (ratios) => ratios.map((aspectRatio, index) => ({ id: `photo-${index}`, aspectRatio }))

function assertNoOverlap(layout, gap = 8) {
  for (let index = 0; index < layout.items.length; index += 1) {
    const a = layout.items[index]
    assert.ok(a.x >= 0)
    assert.ok(a.x + a.width <= layout.columnWidth * layout.columnCount + gap * (layout.columnCount - 1) + 0.001)
    for (let otherIndex = index + 1; otherIndex < layout.items.length; otherIndex += 1) {
      const b = layout.items[otherIndex]
      const horizontallySeparate = a.x + a.width + gap <= b.x + 0.001 || b.x + b.width + gap <= a.x + 0.001
      const verticallySeparate = a.y + a.height + gap <= b.y + 0.001 || b.y + b.height + gap <= a.y + 0.001
      assert.ok(horizontallySeparate || verticallySeparate, `${a.id} overlaps ${b.id}`)
    }
  }
}

test('Masonry preserves portrait, landscape and square proportions', () => {
  const layout = calculateMasonryLayout(photos([0.5, 2, 1]), 1000)
  assert.equal(layout.columnCount, 3)
  assert.ok(layout.items[0].imageHeight > layout.items[2].imageHeight)
  assert.ok(layout.items[2].imageHeight > layout.items[1].imageHeight)
  for (const item of layout.items) {
    assert.ok(Math.abs(item.width / item.imageHeight - item.aspectRatio) < 0.0001)
  }
  assertNoOverlap(layout)
})

test('Masonry handles 1, 2, 10 and many photos without fixed pages', () => {
  assert.equal(calculateMasonryLayout(photos([0.75]), 1200).columnCount, 1)
  assert.equal(calculateMasonryLayout(photos([0.75, 1.8]), 1200).columnCount, 2)
  assert.equal(calculateMasonryLayout(photos(Array(10).fill(4 / 3)), 1200).columnCount, 4)

  const many = calculateMasonryLayout(photos(Array.from({ length: 1000 }, (_, index) => 0.55 + (index % 8) * 0.28)), 1200)
  assert.equal(many.items.length, 1000)
  assertNoOverlap(many)
  const mountedWindow = getVisibleMasonryItems(many.items, 15_000, 800, 1.5)
  assert.ok(mountedWindow.length > 0)
  assert.ok(mountedWindow.length < 80, `virtual window mounted ${mountedWindow.length} photos`)
})

test('Appending a new photo extends the wall without moving existing geometry', () => {
  const initialPhotos = photos([0.6, 1.7, 1, 0.75, 2.2, 0.5, 1.3, 0.9, 1.8, 0.66])
  const before = calculateMasonryLayout(initialPhotos, 1200)
  const after = calculateMasonryLayout([...initialPhotos, { id: 'new-photo', aspectRatio: 0.7 }], 1200)
  assert.deepEqual(after.items.slice(0, before.items.length), before.items)
  assert.ok(after.items.some((item) => item.id === 'new-photo'))
  assert.ok(after.height >= before.height)
})

test('Auto-scroll waits at the bottom and resumes when new content extends the wall', () => {
  const viewportHeight = 800
  const oldContentHeight = 2400
  const oldBottom = oldContentHeight - viewportHeight
  assert.equal(advanceAutoScroll(oldBottom, oldContentHeight, viewportHeight, 1000, 28), oldBottom)
  assert.equal(advanceAutoScroll(oldBottom, oldContentHeight + 500, viewportHeight, 1000, 28), oldBottom + 28)
})

test('Resize recomputes columns and keeps every item inside the viewport width', () => {
  const dataset = photos([0.5, 2.5, 1, 0.65, 1.9, 0.8, 3, 0.45, 1.2, 2.2])
  const desktop = calculateMasonryLayout(dataset, 1280)
  const narrow = calculateMasonryLayout(dataset, 620)
  assert.equal(desktop.columnCount, 4)
  assert.equal(narrow.columnCount, 2)
  assertNoOverlap(desktop)
  assertNoOverlap(narrow)
  assert.ok(narrow.items.every((item) => item.x + item.width <= 620.001))
})

test('TV wall uses continuous virtual scrolling and no page rotation', async () => {
  const [screenSource, masonrySource, cssSource] = await Promise.all([
    readFile(new URL('../src/pages/PhotoHuntScreen.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/features/photo-hunt/PhotoHuntMasonry.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/PhotoHuntScreen.css', import.meta.url), 'utf8'),
  ])

  assert.doesNotMatch(screenSource, /buildPhotoPages|displayPage|setPage/)
  assert.match(screenSource, /\.limit\(1000\)/)
  assert.match(screenSource, /ascending: true/)
  assert.match(masonrySource, /new ResizeObserver/)
  assert.match(masonrySource, /requestAnimationFrame/)
  assert.match(masonrySource, /getVisibleMasonryItems/)
  assert.match(cssSource, /\.photo-hunt-masonry\s*\{[\s\S]*overflow:\s*hidden/)
  assert.match(cssSource, /\.photo-hunt-masonry__photo\s*\{[\s\S]*position:\s*absolute/)
  assert.doesNotMatch(cssSource, /object-fit:\s*cover/)
})
