import { expect, test, type Page, type Route } from '@playwright/test'

const alice = {
  id: 'guest-1',
  name: 'Alice',
  status: 'confirmed',
  created_at: '2026-09-09T00:00:00Z',
}

async function json(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: {
      'access-control-allow-origin': '*',
      'access-control-expose-headers': 'content-range',
      'content-range': '0-0/0',
    },
    body: JSON.stringify(body),
  })
}

async function mockParty(page: Page) {
  const calls: string[] = []
  await page.routeWebSocket(/127\.0\.0\.1:54321/, () => {})
  await page.route('http://127.0.0.1:54321/**', async route => {
    const request = route.request()
    const url = new URL(request.url())

    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } })
      return
    }

    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([^/]+)$/)?.[1]
    if (rpc) {
      calls.push(rpc)
      if (rpc === 'get_party_extras') {
        await json(route, {
          settings: {}, phase: 'preparation', ending_key: '',
          capsule: { own: null, count: 0, revealed: false, entries: [] },
          songs: [], song_count: 0, duo: null, duo_attempts: 0,
          waiting: false, duo_stats: { waiting: 0, completed: 0 }, credits_names: [],
        })
        return
      }
      if (rpc === 'party_data_epoch') {
        await json(route, 0)
        return
      }
      if (rpc === 'claim_party_identity') {
        await json(route, { ok: true, playerKey: 'guest:guest-1', playerName: 'Alice' })
        return
      }
      if (rpc === 'party_identity_is_valid') {
        await json(route, true)
        return
      }
      if (rpc === 'release_party_identity') {
        await json(route, { ok: true, released: true })
        return
      }
    }

    const table = url.pathname.match(/^\/rest\/v1\/([^/]+)$/)?.[1]
    const fixtures: Record<string, unknown> = {
      party_state: {
        id: 'main', environment: 'live', phase: 'preparation', featured_module: null,
        iceberg_visible: true, beer_pong_visible: true, bingo_visible: true,
        missions_visible: true, room_visible: true, photos_visible: true,
        guests_visible: true,
      },
      party_announcements: {
        id: 'main', message: '', kind: 'info', is_active: false,
        expires_at: null, event_id: '', updated_at: '2026-09-09T00:00:00Z',
      },
      guests: [alice],
      plus_ones: [],
      guest_private_notes: [],
      live_vote_public_state: { id: 'main', state: { phase: 'idle' } },
    }
    await json(route, table && table in fixtures ? fixtures[table] : [])
  })
  return calls
}

test('iPhone Safari blocks every identity picker until installation', async ({ page, browserName }) => {
  test.skip(browserName !== 'webkit', 'This scenario requires the iPhone WebKit project')
  const calls = await mockParty(page)

  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1, name: 'Installe Anniv 2026.' })).toBeVisible()
  await expect(
    page.getByRole('complementary', { name: 'Installer l’application' })
      .getByText('Sur l’écran d’accueil', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('Choisis ton prénom.')).toHaveCount(0)
  await expect(page.getByLabel('Participants disponibles')).toHaveCount(0)
  expect(calls).not.toContain('claim_party_identity')

  await page.goto('/chat')
  await expect(page.getByRole('heading', { level: 1, name: 'Installe Anniv 2026.' })).toBeVisible()
  await expect(page.getByText('Ton identité', { exact: true })).toHaveCount(0)

  await page.goto('/info')
  await expect(page.getByRole('heading', { level: 1, name: 'Installe Anniv 2026.' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Infos pratiques' })).toHaveCount(0)
})

test('an existing Safari identity can be released before installation', async ({ page, browserName }) => {
  test.skip(browserName !== 'webkit', 'This scenario requires the iPhone WebKit project')
  const calls = await mockParty(page)

  await page.goto('/')
  await page.evaluate(() => {
    window.localStorage.setItem('anniv-2026-party-identity-v1', JSON.stringify({
      playerKey: 'guest:guest-1',
      sessionToken: 'safari-session',
    }))
  })
  await page.reload()
  await expect(page.getByText('Alice est encore lié à Safari.')).toBeVisible()
  await page.getByRole('button', { name: 'Se déconnecter de Safari' }).click()

  await expect(page.getByRole('status')).toContainText('Alice est libéré')
  expect(calls).toContain('release_party_identity')
  expect(await page.evaluate(() => localStorage.getItem('anniv-2026-party-identity-v1'))).toBeNull()
})

test('iPhone standalone keeps the normal identity picker', async ({ page, browserName }) => {
  test.skip(browserName !== 'webkit', 'This scenario requires the iPhone WebKit project')
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', {
      configurable: true,
      value: true,
    })
  })
  const calls = await mockParty(page)

  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Choisis ton prénom.' })).toBeVisible()
  await page.getByRole('button', { name: /Alice/ }).click()
  await page.getByRole('button', { name: 'C’est moi →' }).click()

  await expect(page.getByText('Bienvenue Alice')).toBeVisible()
  expect(calls).toContain('claim_party_identity')
})

test('Android browser keeps the normal identity picker', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'This scenario requires the Android project')
  await mockParty(page)

  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Choisis ton prénom.' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Alice/ })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Installe Anniv 2026.' })).toHaveCount(0)
})

test('iPadOS desktop user agent is still treated as iOS', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'One desktop project is enough for the iPadOS UA fallback')
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'platform', { configurable: true, value: 'MacIntel' })
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 })
  })
  await mockParty(page)

  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Installe Anniv 2026.' })).toBeVisible()
  await expect(page.getByText('Choisis ton prénom.')).toHaveCount(0)
})
