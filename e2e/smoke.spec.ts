import { expect, test, type Page, type Route } from '@playwright/test'

const partyState = {
  id: 'main',
  environment: 'live',
  phase: 'preparation',
  featured_module: null,
  iceberg_visible: true,
  beer_pong_visible: true,
  bingo_visible: true,
  missions_visible: true,
  room_visible: true,
  photos_visible: true,
  guests_visible: true,
}

const extras = {
  settings: {
    capsule_visible: true,
    capsule_open: true,
    capsule_reveal_at: '2026-10-25T11:00:00Z',
    jukebox_visible: true,
    jukebox_open: true,
    duos_visible: true,
    duos_open: false,
    credits_enabled: true,
    credits_run: '',
  },
  phase: 'preparation',
  ending_key: '',
  capsule: { own: null, count: 0, revealed: false, entries: [] },
  songs: [],
  song_count: 0,
  duo: null,
  duo_attempts: 0,
  waiting: false,
  duo_stats: { waiting: 0, completed: 0 },
  credits_names: [],
}

const tableFixtures: Record<string, unknown> = {
  party_state: partyState,
  party_announcements: {
    id: 'main',
    message: '',
    kind: 'info',
    is_active: false,
    expires_at: null,
    event_id: '',
    updated_at: '2026-09-08T00:00:00Z',
  },
  party_event_info: {
    id: 'main',
    event_at: '2026-10-24T19:30:00Z',
    venue_name: 'Maison',
    address: '19 Rue Louison Bobet, Neuilly-Plaisance 93360',
    access_notes: 'La porte donne directement sur la maison.',
    dress_code: 'Tenue libre',
    parking_notes: '',
    other_notes: '',
    updated_at: '2026-09-08T00:00:00Z',
  },
  live_vote_public_state: { id: 'main', state: { phase: 'idle' } },
  guests: [],
  plus_ones: [],
}

const rpcFixtures: Record<string, unknown> = {
  party_data_epoch: 0,
  get_party_extras: extras,
}

type BrowserGuard = {
  consoleErrors: string[]
  pageErrors: string[]
  rejectedWrites: string[]
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: {
      'access-control-allow-origin': '*',
      'access-control-expose-headers': 'content-range',
      'content-range': '0-0/0',
    },
    body: JSON.stringify(body),
  })
}

async function guardBrowser(page: Page): Promise<BrowserGuard> {
  const guard: BrowserGuard = {
    consoleErrors: [],
    pageErrors: [],
    rejectedWrites: [],
  }

  page.on('console', message => {
    if (message.type() === 'error') guard.consoleErrors.push(message.text())
  })
  page.on('pageerror', error => guard.pageErrors.push(error.message))

  await page.routeWebSocket(/127\.0\.0\.1:54321/, () => {})
  await page.route('http://127.0.0.1:54321/**', async route => {
    const request = route.request()
    const url = new URL(request.url())

    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } })
      return
    }

    const rpcMatch = url.pathname.match(/^\/rest\/v1\/rpc\/([^/]+)$/)
    if (rpcMatch) {
      const rpc = rpcMatch[1]
      if (request.method() !== 'POST' || !(rpc in rpcFixtures)) {
        guard.rejectedWrites.push(`${request.method()} ${url.pathname}`)
        await json(route, { message: 'Blocked by read-only browser test' }, 405)
        return
      }
      await json(route, rpcFixtures[rpc])
      return
    }

    const tableMatch = url.pathname.match(/^\/rest\/v1\/([^/]+)$/)
    if (tableMatch) {
      const table = tableMatch[1]
      if (request.method() !== 'GET' || !(table in tableFixtures)) {
        guard.rejectedWrites.push(`${request.method()} ${url.pathname}`)
        await json(route, { message: 'Blocked by read-only browser test' }, 405)
        return
      }
      await json(route, tableFixtures[table])
      return
    }

    guard.rejectedWrites.push(`${request.method()} ${url.pathname}`)
    await json(route, { message: 'Unexpected Supabase request' }, 405)
  })

  return guard
}

function expectCleanBrowser(guard: BrowserGuard) {
  expect(guard.rejectedWrites).toEqual([])
  expect(guard.pageErrors).toEqual([])
  expect(guard.consoleErrors).toEqual([])
}

test('practical information loads without a production dependency', async ({ page }) => {
  const guard = await guardBrowser(page)
  await page.goto('/info')

  await expect(page.getByRole('heading', { level: 1, name: 'Infos pratiques' })).toBeVisible()
  await expect(page.getByText('samedi 24 octobre 2026 à 21:30')).toBeVisible()
  await expect(page.getByText('19 Rue Louison Bobet, Neuilly-Plaisance 93360')).toBeVisible()
  await expect(page.getByText('Tenue libre')).toBeVisible()
  await expect(page.getByText('Stationnement')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expectCleanBrowser(guard)
})

test('preparation blocks a direct game URL and explains the redirect', async ({ page }) => {
  const guard = await guardBrowser(page)
  await page.goto('/play')

  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText('Cette activité ouvrira pendant la soirée.')).toBeVisible()
  await expect(page.getByRole('dialog')).toBeVisible()
  expectCleanBrowser(guard)
})

test('admin login is reachable without exposing guest controls', async ({ page }) => {
  const guard = await guardBrowser(page)
  await page.goto('/admin/login')

  await expect(page.getByRole('heading', { level: 1, name: 'Administration' })).toBeVisible()
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByLabel('Mot de passe')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeEnabled()
  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toHaveCount(0)
  expectCleanBrowser(guard)
})
