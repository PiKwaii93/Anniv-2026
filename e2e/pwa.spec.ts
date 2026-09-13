import { expect, test } from '@playwright/test'

test.use({ serviceWorkers: 'allow' })

test('production preview registers the conservative service worker', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Service worker Cache API validation runs in Chromium')

  await page.route('http://127.0.0.1:54321/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: '[]',
  }))
  await page.goto('/')

  const manifest = await page.evaluate(async () => {
    const response = await fetch('/manifest.webmanifest')
    return response.json()
  })
  expect(manifest.display).toBe('standalone')

  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)

  await page.evaluate(async () => {
    await Promise.all(['/screen', '/admin', '/captain', '/qr'].map(path => fetch(path)))
  })

  const cachedUrls = await page.evaluate(async () => {
    const keys = await caches.keys()
    const requests = await Promise.all(keys.map(async key => (await caches.open(key)).keys()))
    return requests.flat().map(request => request.url)
  })
  for (const path of ['/screen', '/admin', '/captain', '/qr']) {
    expect(cachedUrls.some(url => new URL(url).pathname === path)).toBe(false)
  }
  expect(cachedUrls.some(url => new URL(url).origin === 'http://127.0.0.1:54321')).toBe(false)
})
