import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  BEER_PONG_NEXT_NOTIFICATION,
  createBeerPongNextPushHandler,
} from '../supabase/functions/beer-pong-next-push/service.ts'

const post = (body = {}) => new Request('https://push.test', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

function fixture(overrides = {}) {
  const sent = []
  const removed = []
  const completed = []
  const listedKeys = []

  const dependencies = {
    isAdmin: async () => true,
    recordWinner: async matchId => ({
      ok: true,
      changed: true,
      correction: false,
      state: { rounds: [] },
      eventKey: `beer-pong-next:${matchId}-next`,
    }),
    claimEvent: async eventKey => ({
      eventKey,
      matchId: eventKey.replace('beer-pong-next:', ''),
      playerKeys: ['guest:adam', 'guest:alex'],
    }),
    listSubscriptions: async playerKeys => {
      listedKeys.push(...playerKeys)
      return playerKeys.map(playerKey => ({
        endpoint: `https://push.example/${playerKey}`,
        p256dh: 'p'.repeat(50),
        auth: 'a'.repeat(20),
      }))
    },
    send: async (subscription, notification, tag) => {
      sent.push({ subscription, notification, tag })
    },
    removeExpired: async endpoint => { removed.push(endpoint) },
    completeEvent: async (eventKey, delivery) => {
      completed.push({ eventKey, delivery })
    },
    ...overrides,
  }

  return {
    handler: createBeerPongNextPushHandler(dependencies),
    sent,
    removed,
    completed,
    listedKeys,
  }
}

test('a newly determined next match targets only its players with the Beer Pong route', async () => {
  const { handler, sent, listedKeys } = fixture()
  const response = await handler(post({ matchId: 'match-1', winnerTeamId: 'team-a' }))

  assert.equal(response.status, 200)
  assert.deepEqual(listedKeys, ['guest:adam', 'guest:alex'])
  assert.equal(sent.length, 2)
  assert.ok(sent.every(item => item.notification === BEER_PONG_NEXT_NOTIFICATION))
  assert.ok(sent.every(item => item.notification.route === '/beer-pong'))
  assert.ok(sent.every(item => !item.subscription.endpoint.includes('outsider')))
})

test('a next match without subscriptions completes without error', async () => {
  const { handler, sent, completed } = fixture({
    listSubscriptions: async () => [],
  })
  const response = await handler(post({ matchId: 'match-1', winnerTeamId: 'team-a' }))

  assert.equal(response.status, 200)
  assert.equal(sent.length, 0)
  assert.deepEqual(completed[0].delivery, { sent: 0, expired: 0, failed: 0 })
})

test('one subscribed player produces exactly one delivery', async () => {
  const { handler, sent } = fixture({
    listSubscriptions: async () => [{
      endpoint: 'https://push.example/adam',
      p256dh: 'p'.repeat(50),
      auth: 'a'.repeat(20),
    }],
  })
  await handler(post({ matchId: 'match-1', winnerTeamId: 'team-a' }))
  assert.equal(sent.length, 1)
})

test('claiming the same event twice prevents duplicate delivery', async () => {
  const claimed = new Set()
  const { handler, sent } = fixture({
    claimEvent: async eventKey => {
      if (claimed.has(eventKey)) return null
      claimed.add(eventKey)
      return { eventKey, matchId: 'match-2', playerKeys: ['guest:adam'] }
    },
  })

  await handler(post({ matchId: 'match-1', winnerTeamId: 'team-a' }))
  await handler(post({ matchId: 'match-1', winnerTeamId: 'team-a' }))
  assert.equal(sent.length, 1)
})

test('a different next match has its own event and may be delivered', async () => {
  const { handler, sent } = fixture({
    claimEvent: async eventKey => ({
      eventKey,
      matchId: eventKey,
      playerKeys: ['guest:adam'],
    }),
  })

  await handler(post({ matchId: 'match-1', winnerTeamId: 'team-a' }))
  await handler(post({ matchId: 'match-2', winnerTeamId: 'team-b' }))
  assert.equal(sent.length, 2)
  assert.notEqual(sent[0].tag, sent[1].tag)
})

test('a corrected result updates the bracket without creating another push event', async () => {
  let claims = 0
  const { handler, sent } = fixture({
    recordWinner: async () => ({
      ok: true,
      changed: true,
      correction: true,
      state: { rounds: [] },
      eventKey: null,
    }),
    claimEvent: async () => { claims += 1; return null },
  })

  const response = await handler(post({ matchId: 'match-1', winnerTeamId: 'team-b' }))
  assert.equal(response.status, 200)
  assert.equal(claims, 0)
  assert.equal(sent.length, 0)
})

test('404 and 410 endpoints are removed while other delivery errors are not retried', async () => {
  const statuses = [404, 410, 500]
  const { handler, removed, completed } = fixture({
    listSubscriptions: async () => statuses.map(status => ({
      endpoint: `https://push.example/${status}`,
      p256dh: 'p'.repeat(50),
      auth: 'a'.repeat(20),
    })),
    send: async subscription => {
      throw { statusCode: Number(subscription.endpoint.split('/').at(-1)) }
    },
  })

  await handler(post({ matchId: 'match-1', winnerTeamId: 'team-a' }))
  assert.deepEqual(removed, ['https://push.example/404', 'https://push.example/410'])
  assert.deepEqual(completed[0].delivery, { sent: 0, expired: 2, failed: 1 })
})

test('a non-admin client cannot record a winner or trigger a push', async () => {
  let writes = 0
  const { handler, sent } = fixture({
    isAdmin: async () => false,
    recordWinner: async () => { writes += 1; return { ok: true } },
  })

  const response = await handler(post({ matchId: 'match-1', winnerTeamId: 'team-a' }))
  assert.equal(response.status, 403)
  assert.equal(writes, 0)
  assert.equal(sent.length, 0)
})

test('the database transition owns next-match detection, deduplication, and player-key mapping', async () => {
  const migration = await readFile(
    new URL('../supabase/migrations/20260914213000_beer_pong_next_push.sql', import.meta.url),
    'utf8',
  )
  const config = await readFile(new URL('../supabase/config.toml', import.meta.url), 'utf8')
  const edge = await readFile(
    new URL('../supabase/functions/beer-pong-next-push/index.ts', import.meta.url),
    'utf8',
  )
  const page = await readFile(new URL('../src/pages/BeerPong.tsx', import.meta.url), 'utf8')

  assert.match(migration, /from public\.beer_pong_state[\s\S]*for update/)
  assert.match(migration, /private_beer_pong_next_match\(v_state\)/)
  assert.match(migration, /v_environment = 'live'/)
  assert.match(migration, /not v_is_correction/)
  assert.match(migration, /event_key text primary key/)
  assert.match(migration, /on conflict \(event_key\) do nothing/)
  assert.match(migration, /when v_player_id like 'plus-one:%'[\s\S]*then 'plus:' /)
  assert.match(config, /\[functions\.beer-pong-next-push\][\s\S]*verify_jwt = true/)
  assert.match(edge, /withSupabase\(\{ auth: 'user' \}/)
  assert.match(edge, /from\('app_admins'\)/)
  assert.match(edge, /\.in\('player_key', playerKeys\)/)
  assert.match(page, /functions\.invoke\([\s\S]*'beer-pong-next-push'/)
  assert.doesNotMatch(page, /updateTournamentWinner\(/)
})
