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
  guest_private_notes: [],
}

const rpcFixtures: Record<string, unknown> = {
  party_data_epoch: 0,
  get_party_extras: extras,
}

type BrowserGuard = {
  consoleErrors: string[]
  reactWarnings: string[]
  pageErrors: string[]
  rejectedWrites: string[]
}

type BrowserFixtures = {
  tables?: Record<string, unknown>
  rpcs?: Record<string, unknown>
  adminAuth?: boolean
}

const adminAccessToken = [
  Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({
    sub: 'admin-1',
    role: 'authenticated',
    aud: 'authenticated',
    exp: 4_102_444_800,
  })).toString('base64url'),
  'e2e-signature',
].join('.')

const adminAuthResponse = {
  access_token: adminAccessToken,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 4_102_444_800,
  refresh_token: 'e2e-refresh-token',
  user: {
    id: 'admin-1',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'admin@example.test',
    email_confirmed_at: '2026-09-09T00:00:00Z',
    phone: '',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: '2026-09-09T00:00:00Z',
    updated_at: '2026-09-09T00:00:00Z',
  },
}

const seriousReactWarning = /(?:each child in a list|encountered two children|cannot update a component|react does not recognize|validateDOMNesting|hydration|not wrapped in act|invalid hook call)/i

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

async function guardBrowser(
  page: Page,
  fixtures: BrowserFixtures = {},
): Promise<BrowserGuard> {
  const guard: BrowserGuard = {
    consoleErrors: [],
    reactWarnings: [],
    pageErrors: [],
    rejectedWrites: [],
  }
  const tables = { ...tableFixtures, ...fixtures.tables }
  const rpcs = { ...rpcFixtures, ...fixtures.rpcs }

  page.on('console', message => {
    const text = message.text()
    if (message.type() === 'error') guard.consoleErrors.push(text)
    if (message.type() === 'warning' && seriousReactWarning.test(text)) {
      guard.reactWarnings.push(text)
    }
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

    if (
      fixtures.adminAuth
      && request.method() === 'POST'
      && url.pathname === '/auth/v1/token'
      && url.searchParams.get('grant_type') === 'password'
    ) {
      await json(route, adminAuthResponse)
      return
    }

    const rpcMatch = url.pathname.match(/^\/rest\/v1\/rpc\/([^/]+)$/)
    if (rpcMatch) {
      const rpc = rpcMatch[1]
      if (request.method() !== 'POST' || !(rpc in rpcs)) {
        guard.rejectedWrites.push(`${request.method()} ${url.pathname}`)
        await json(route, { message: 'Blocked by read-only browser test' }, 405)
        return
      }
      await json(route, rpcs[rpc])
      return
    }

    const tableMatch = url.pathname.match(/^\/rest\/v1\/([^/]+)$/)
    if (tableMatch) {
      const table = tableMatch[1]
      if (request.method() !== 'GET' || !(table in tables)) {
        guard.rejectedWrites.push(`${request.method()} ${url.pathname}`)
        await json(route, { message: 'Blocked by read-only browser test' }, 405)
        return
      }
      await json(route, tables[table])
      return
    }

    guard.rejectedWrites.push(`${request.method()} ${url.pathname}`)
    await json(route, { message: 'Unexpected Supabase request' }, 405)
  })

  return guard
}

async function openAdminPage(page: Page, path: string) {
  await page.goto(path)
  await expect(page).toHaveURL(/\/admin\/login$/)
  await page.getByLabel('Email').fill('admin@example.test')
  await page.getByLabel('Mot de passe').fill('e2e-password')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(new RegExp(`${path}$`))
}

function expectCleanBrowser(guard: BrowserGuard) {
  expect(guard.rejectedWrites).toEqual([])
  expect(guard.pageErrors).toEqual([])
  expect(guard.consoleErrors).toEqual([])
  expect(guard.reactWarnings).toEqual([])
}

test('Beer Pong tree keeps vertical page scrolling over its horizontal canvas', async ({ page }) => {
  const players = Array.from({ length: 42 }, (_, index) => ({
    id: `player-${index + 1}`,
    name: `Joueur ${index + 1}`,
  }))
  const teams = Array.from({ length: 21 }, (_, index) => ({
    id: `team-${index + 1}`,
    playerIds: [`player-${index * 2 + 1}`, `player-${index * 2 + 2}`],
  }))
  const firstRound = Array.from({ length: 16 }, (_, index) => {
    const competitive = index < 5
    const teamAIndex = competitive ? index * 2 : index + 5
    return {
      id: `match-${index + 1}`,
      teamAId: teams[teamAIndex].id,
      teamBId: competitive ? teams[index * 2 + 1].id : null,
      winnerTeamId: teams[teamAIndex].id,
    }
  })
  const duplicatedLegacyRound = Array.from({ length: 8 }, (_, index) => ({
    id: 'duplicated-legacy-id',
    teamAId: firstRound[index * 2].winnerTeamId,
    teamBId: firstRound[index * 2 + 1].winnerTeamId,
    winnerTeamId: null,
  }))
  const guard = await guardBrowser(page, {
    tables: {
      party_state: { ...partyState, phase: 'live' },
      beer_pong_state: {
        id: 'main',
        state: {
          draftValidated: true,
          playerSnapshots: players,
          teams,
          rounds: [firstRound, duplicatedLegacyRound],
        },
      },
    },
  })

  await page.goto('/beer-pong/bracket')
  const tree = page.locator('.tournament-tree')
  await expect(tree).toBeVisible({ timeout: 20_000 })
  const matchLabels = await tree.locator('.tournament-tree__match-number').allTextContents()
  expect(matchLabels).toHaveLength(31)
  expect(new Set(matchLabels).size).toBe(31)
  await tree.hover()
  await page.mouse.wheel(0, 700)

  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300)
  expectCleanBrowser(guard)
})

test('practical information loads without a production dependency', async ({ page }) => {
  const guard = await guardBrowser(page)
  await page.goto('/info')

  await expect(page.getByRole('heading', { level: 1, name: 'Infos pratiques' })).toBeVisible()
  await expect(page.getByText('samedi 24 octobre 2026 à 21:30')).toBeVisible()
  await expect(page.getByText('19 Rue Louison Bobet, Neuilly-Plaisance 93360')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Ouvrir dans Google Maps' })).toHaveAttribute(
    'href',
    /google\.com\/maps\/search\/\?api=1&query=/,
  )
  await expect(page.getByText('Lieu', { exact: true })).toHaveCount(0)
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

test('Bingo toggles a grid cell in one click and keeps it checked in list view', async ({ page }) => {
  const prompts = Array.from({ length: 16 }, (_, index) => ({
    id: `prompt-${index + 1}`,
    text: `Situation de test ${index + 1}`,
  }))
  const guard = await guardBrowser(page, {
    tables: {
      party_state: { ...partyState, phase: 'live' },
      bingo_prompts: prompts,
    },
  })

  await page.goto('/bingo')

  const cells = page.locator('.bingo-cell')
  await expect(cells).toHaveCount(16)
  await expect(cells.first()).toHaveAttribute('aria-pressed', 'false')
  await cells.first().click()
  await expect(cells.first()).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Progression')).toContainText('1')

  await page.getByRole('button', { name: 'Liste lisible' }).click()
  await expect(cells.first()).toHaveAttribute('aria-pressed', 'true')
  expectCleanBrowser(guard)
})

test('La Salle displays a directly revealed unanimous nomination', async ({ page }) => {
  const identity = { playerKey: 'guest:guest-1', sessionToken: 'e2e-session' }
  const playerState = {
    ok: true,
    playerKey: identity.playerKey,
    playerName: 'Alice',
    score: 0,
    myVote: 'guest:guest-2',
  }
  const guard = await guardBrowser(page, {
    tables: {
      party_state: { ...partyState, phase: 'live' },
      guests: [
        { id: 'guest-1', name: 'Alice', status: 'confirmed', created_at: '2026-09-09T00:00:00Z' },
        { id: 'guest-2', name: 'Bob', status: 'confirmed', created_at: '2026-09-09T00:00:01Z' },
      ],
      live_vote_public_state: {
        id: 'main',
        state: {
          phase: 'revealed',
          roundId: 'round-1',
          mode: 'likely',
          prompt: 'Qui finira la soirée à 7 h ?',
          stage: 'nomination',
          voteCount: 2,
          result: {
            rows: [{ key: 'guest:guest-2', label: 'Bob', count: 2, percentage: 100 }],
            totalVotes: 2,
            winnerKeys: ['guest:guest-2'],
          },
          revealNote: 'Nomination unanime · résultat direct.',
        },
      },
    },
    rpcs: {
      claim_party_identity: { ok: true, playerKey: identity.playerKey, playerName: 'Alice' },
      party_identity_is_valid: true,
      claim_live_vote_identity: playerState,
      get_live_vote_player_state: playerState,
      get_live_vote_scoreboard: [],
    },
  })

  await page.goto('/room')
  await page.getByRole('button', { name: /Alice/ }).click()
  await page.getByRole('button', { name: 'C’est moi' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Qui finira la soirée à 7 h ?' })).toBeVisible()
  await expect(page.locator('.live-room__result--winner')).toContainText('Bob')
  await expect(page.locator('.live-room__result--winner')).toContainText('100%')
  await expect(page.getByText('Nomination unanime · résultat direct.')).toBeVisible()
  await expect(page.getByText('Finale', { exact: true })).toHaveCount(0)
  expectCleanBrowser(guard)
})

test('rehearsal admin shows Spotify as disabled without loading its controller', async ({ page }) => {
  const guard = await guardBrowser(page, {
    adminAuth: true,
    tables: {
      party_state: { ...partyState, environment: 'rehearsal' },
      app_admins: { user_id: 'admin-1' },
    },
  })

  await openAdminPage(page, '/admin/party-extras')

  await expect(page.getByText('Spotify est désactivé en mode répétition.')).toBeVisible()
  await expect(page.getByText('Chargement de la connexion Spotify…')).toHaveCount(0)
  expectCleanBrowser(guard)
})

test('rehearsal admin cannot edit any practical information field', async ({ page }) => {
  const guard = await guardBrowser(page, {
    adminAuth: true,
    tables: {
      party_state: { ...partyState, environment: 'rehearsal' },
      app_admins: { user_id: 'admin-1' },
    },
  })

  await openAdminPage(page, '/admin/info')

  await expect(page.getByText('Les infos pratiques restent celles de la vraie soirée.')).toBeVisible()
  const fields = page.locator('.event-info-form input, .event-info-form textarea')
  await expect(fields).toHaveCount(7)
  for (let index = 0; index < 7; index += 1) {
    await expect(fields.nth(index)).toBeDisabled()
  }
  await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
  expectCleanBrowser(guard)
})
