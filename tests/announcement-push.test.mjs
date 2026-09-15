import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  ANNOUNCEMENT_NOTIFICATION,
  createAnnouncementPushHandler,
} from '../supabase/functions/announcement-push/service.ts'

const requestBody = {
  message: '🍕 Les pizzas sont arrivées !',
  kind: 'food',
  durationSeconds: 15,
  eventId: '9cc6b819-5100-4c2d-b53a-faa92e83e343',
}

const post = (body = requestBody) => new Request('https://push.test', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

function createDependencies(overrides = {}) {
  return {
    isAdmin: async () => true,
    publish: async input => ({
      ok: true,
      eventKey: `announcement:${input.eventId}`,
      announcement: {
        id: 'main',
        message: input.message,
        kind: input.kind,
        is_active: true,
        expires_at: null,
        event_id: input.eventId,
        updated_at: new Date().toISOString(),
      },
    }),
    claimEvent: async eventKey => ({
      eventKey,
      announcementEventId: requestBody.eventId,
    }),
    listSubscriptions: async () => [],
    send: async () => undefined,
    removeExpired: async () => undefined,
    completeEvent: async () => undefined,
    ...overrides,
  }
}

test('only an authenticated administrator can publish an announcement Push', async () => {
  let published = 0
  const handler = createAnnouncementPushHandler(createDependencies({
    isAdmin: async () => false,
    publish: async () => { published += 1; throw new Error('must not run') },
  }))

  const response = await handler(post())
  assert.equal(response.status, 403)
  assert.equal(published, 0)
})

test('an explicit announcement Push reaches every subscribed device with fixed navigation', async () => {
  const sent = []
  let completed
  const subscriptions = ['one', 'two'].map(endpoint => ({
    endpoint: `https://push.example/${endpoint}`,
    p256dh: 'p'.repeat(50),
    auth: 'a'.repeat(20),
  }))
  const handler = createAnnouncementPushHandler(createDependencies({
    listSubscriptions: async () => subscriptions,
    send: async (subscription, notification) => sent.push({ subscription, notification }),
    completeEvent: async (eventKey, delivery) => { completed = { eventKey, delivery } },
  }))

  const response = await handler(post())
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.deepEqual(body.delivery, { sent: 2, expired: 0, failed: 0 })
  assert.equal(sent.length, 2)
  assert.equal(sent[0].notification.title, '📣 Anniv 2026')
  assert.equal(sent[0].notification.body, requestBody.message)
  assert.equal(sent[0].notification.route, '/')
  assert.equal(sent[0].notification.suppressWhenVisible, true)
  assert.deepEqual(completed.delivery, body.delivery)
})

test('claiming the same announcement event twice prevents duplicate notifications', async () => {
  let claimed = false
  let deliveries = 0
  const dependencies = createDependencies({
    claimEvent: async eventKey => {
      if (claimed) return null
      claimed = true
      return { eventKey, announcementEventId: requestBody.eventId }
    },
    listSubscriptions: async () => [{
      endpoint: 'https://push.example/device',
      p256dh: 'p'.repeat(50),
      auth: 'a'.repeat(20),
    }],
    send: async () => { deliveries += 1 },
  })
  const handler = createAnnouncementPushHandler(dependencies)

  assert.equal((await handler(post())).status, 200)
  assert.equal((await handler(post())).status, 200)
  assert.equal(deliveries, 1)
})

test('announcement Push uses a private event ledger and the existing endpoint cleanup', async () => {
  const migration = await readFile(
    new URL('../supabase/migrations/20260914230000_announcement_push.sql', import.meta.url),
    'utf8',
  )
  const edge = await readFile(
    new URL('../supabase/functions/announcement-push/index.ts', import.meta.url),
    'utf8',
  )
  const config = await readFile(new URL('../supabase/config.toml', import.meta.url), 'utf8')
  const section = config.match(/\[functions\.announcement-push\]([\s\S]*?)(?=\n\[|$)/)?.[1] ?? ''

  assert.match(migration, /event_key text primary key/)
  assert.match(migration, /on conflict \(event_key\) do nothing/)
  assert.match(migration, /revoke all on table public\.announcement_push_events from public, anon, authenticated/)
  assert.match(migration, /grant execute[\s\S]*to service_role/)
  assert.match(section, /verify_jwt\s*=\s*true/)
  assert.match(edge, /withSupabase\(\{ auth: 'user' \}/)
  assert.match(edge, /from\('app_admins'\)/)
  assert.match(edge, /from\('push_subscriptions'\)/)
  assert.match(edge, /\.delete\(\)[\s\S]*\.eq\('endpoint', endpoint\)/)
  assert.equal(ANNOUNCEMENT_NOTIFICATION.route, '/')
})
