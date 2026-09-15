import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'
import { build } from 'vite'
import { createPushSubscriptionHandler } from '../supabase/functions/push-subscription/service.ts'
import { createPushTestHandler, deliverPushNotifications, TEST_NOTIFICATION } from '../supabase/functions/push-test/service.ts'

const post = body => new Request('https://push.test', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})

test('subscription endpoint refuses requests without a guest identity', async () => {
  const handler = createPushSubscriptionHandler({ publicKey: 'public', register: async () => ({ ok: true }), revoke: async () => ({ ok: true }) })
  const response = await handler(post({ action: 'register' }))
  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { ok: false, error: 'IDENTITY_REQUIRED' })
})

test('subscription registration validates the session server-side and rejects invalid sessions', async () => {
  const handler = createPushSubscriptionHandler({
    publicKey: 'public',
    register: async () => ({ ok: false, code: 'INVALID_SESSION' }),
    revoke: async () => ({ ok: true }),
  })
  const response = await handler(post({
    action: 'register', playerKey: 'guest:adam', sessionToken: 'token',
    subscription: { endpoint: 'https://push.example/endpoint', keys: { p256dh: 'p'.repeat(50), auth: 'a'.repeat(20) } },
  }))
  assert.equal(response.status, 401)
  assert.equal((await response.json()).error, 'INVALID_SESSION')
})

test('valid subscriptions are registered with the proven identity', async () => {
  let received
  const handler = createPushSubscriptionHandler({
    publicKey: 'public', register: async input => { received = input; return { ok: true } }, revoke: async () => ({ ok: true }),
  })
  const response = await handler(post({
    action: 'register', playerKey: 'guest:adam', sessionToken: 'session',
    subscription: { endpoint: 'https://push.example/endpoint', keys: { p256dh: 'p'.repeat(50), auth: 'a'.repeat(20) } },
  }))
  assert.equal(response.status, 200)
  assert.equal(received.playerKey, 'guest:adam')
  assert.equal(received.sessionToken, 'session')
})

test('malformed or insecure push endpoints are rejected before storage', async () => {
  let calls = 0
  const handler = createPushSubscriptionHandler({ publicKey: 'public', register: async () => { calls++; return { ok: true } }, revoke: async () => ({ ok: true }) })
  const response = await handler(post({
    action: 'register', playerKey: 'guest:adam', sessionToken: 'session',
    subscription: { endpoint: 'http://invalid', keys: { p256dh: 'p'.repeat(50), auth: 'a'.repeat(20) } },
  }))
  assert.equal(response.status, 400)
  assert.equal(calls, 0)
})

test('anonymous guests cannot send a push and client text never controls the test message', async () => {
  const denied = createPushTestHandler({ isAdmin: async () => false, listTargets: async () => [], sendTest: async () => ({ sent: 1, expired: 0, failed: 0 }) })
  assert.equal((await denied(post({ action: 'send-test', playerKey: 'guest:adam' }))).status, 403)

  let notification
  const allowed = createPushTestHandler({
    isAdmin: async () => true,
    listTargets: async () => [],
    sendTest: async (_playerKey, fixed) => { notification = fixed; return { sent: 1, expired: 0, failed: 0 } },
  })
  const response = await allowed(post({ action: 'send-test', playerKey: 'guest:adam', title: 'Piège', body: 'Texte libre' }))
  assert.equal(response.status, 200)
  assert.deepEqual(notification, TEST_NOTIFICATION)
})

test('push functions retain the correct authentication boundaries', async () => {
  const config = await readFile(new URL('../supabase/config.toml', import.meta.url), 'utf8')
  const subscriptionSection = config.match(/\[functions\.push-subscription\]([\s\S]*?)(?=\n\[|$)/)?.[1] ?? ''
  const testSection = config.match(/\[functions\.push-test\]([\s\S]*?)(?=\n\[|$)/)?.[1] ?? ''
  const testEntry = await readFile(new URL('../supabase/functions/push-test/index.ts', import.meta.url), 'utf8')
  assert.match(subscriptionSection, /verify_jwt\s*=\s*false/)
  assert.match(testSection, /verify_jwt\s*=\s*true/)
  assert.match(testEntry, /withSupabase\(\{ auth: 'user' \}/)
  assert.match(testEntry, /context\.userClaims\?\.id/)
  assert.match(testEntry, /from\('app_admins'\)/)
})

test('a missing or expired subscription cannot be reported as delivered', async () => {
  const handler = createPushTestHandler({ isAdmin: async () => true, listTargets: async () => [], sendTest: async () => ({ sent: 0, expired: 0, failed: 0 }) })
  const response = await handler(post({ action: 'send-test', playerKey: 'guest:adam' }))
  assert.equal(response.status, 404)
  assert.equal((await response.json()).error, 'NO_SUBSCRIPTION')
})

test('expired push endpoints are removed for both 404 and 410 responses', async () => {
  const removed = []
  const subscriptions = [404, 410, 500].map(statusCode => ({
    endpoint: `https://push.example/${statusCode}`, p256dh: 'p'.repeat(50), auth: 'a'.repeat(20),
  }))
  const result = await deliverPushNotifications(
    subscriptions,
    async subscription => { throw { statusCode: Number(subscription.endpoint.split('/').at(-1)) } },
    async endpoint => { removed.push(endpoint) },
  )
  assert.deepEqual(result, { sent: 0, expired: 2, failed: 1 })
  assert.deepEqual(removed, ['https://push.example/404', 'https://push.example/410'])
})

test('schema keeps endpoints private and removes them with the identity session', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20260914154424_push_notifications.sql', import.meta.url), 'utf8')
  assert.match(migration, /references public\.party_identity_sessions\(player_key\)[\s\S]*on delete cascade/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all on table public\.push_subscriptions from public, anon, authenticated/)
  assert.match(migration, /party_identity\.is_valid\(p_player_key, p_session_token\)/)
  assert.doesNotMatch(migration, /grant select[^;]+to (?:anon|authenticated)/)
})

const cache = resolve('node_modules/.cache/push-client-test.mjs')
const bundle = await build({
  configFile: false, logLevel: 'error',
  plugins: [{
    name: 'push-supabase-fixture', enforce: 'pre',
    resolveId(id) { if (id === '../../lib/supabase') return '\0push-supabase-fixture' },
    load(id) { if (id === '\0push-supabase-fixture') return 'export const supabase = { functions: { invoke: (...args) => globalThis.__pushInvoke(...args) } }' },
  }],
  build: { ssr: resolve('src/features/push/pushClient.ts'), write: false, minify: false },
})
await mkdir(resolve('node_modules/.cache'), { recursive: true })
await writeFile(cache, bundle.output.find(item => item.type === 'chunk').code)
const pushClient = await import(pathToFileURL(cache).href)
after(async () => { delete globalThis.__pushInvoke; await rm(cache) })

function browserFixture({ permission = 'default', requested = permission, subscription = null, createdSubscription = subscription } = {}) {
  const calls = []
  const pushManager = {
    getSubscription: async () => subscription,
    subscribe: async options => { calls.push(['subscribe', options]); return createdSubscription },
  }
  const registration = { pushManager }
  const notification = { permission, requestPermission: async () => requested }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    isSecureContext: true, PushManager: function PushManager() {}, Notification: notification,
    atob: value => Buffer.from(value, 'base64').toString('binary'), setTimeout,
  } })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    serviceWorker: { getRegistration: async () => registration, ready: Promise.resolve(registration) },
  } })
  Object.defineProperty(globalThis, 'Notification', { configurable: true, value: notification })
  return calls
}

test('iOS browser is incompatible until installed while Android and iOS standalone stay eligible', () => {
  browserFixture()
  assert.equal(pushClient.getPushAvailability({ platform: 'ios', installed: false }), 'ios-install-required')
  assert.equal(pushClient.getPushAvailability({ platform: 'ios', installed: true }), 'available')
  assert.equal(pushClient.getPushAvailability({ platform: 'android', installed: false }), 'available')
})

test('a refused permission creates no subscription and is not retried automatically', async () => {
  browserFixture({ permission: 'default', requested: 'denied' })
  let invokes = 0
  globalThis.__pushInvoke = async () => { invokes++; return { data: { ok: true }, error: null } }
  const result = await pushClient.enablePushNotifications({ playerKey: 'guest:adam', sessionToken: 'session' })
  assert.deepEqual(result, { permission: 'denied', enabled: false })
  assert.equal(invokes, 0)
})

test('an accepted permission subscribes and registers the device for the current identity', async () => {
  const subscription = {
    endpoint: 'https://push.example/endpoint',
    toJSON: () => ({ endpoint: 'https://push.example/endpoint', keys: { p256dh: 'p'.repeat(50), auth: 'a'.repeat(20) } }),
  }
  const calls = browserFixture({ permission: 'default', requested: 'granted', subscription })
  const actions = []
  globalThis.__pushInvoke = async (_name, { body }) => {
    actions.push(body.action)
    return { data: body.action === 'config' ? { ok: true, publicKey: 'AQID' } : { ok: true }, error: null }
  }
  const result = await pushClient.enablePushNotifications({ playerKey: 'guest:adam', sessionToken: 'session' })
  assert.deepEqual(result, { permission: 'granted', enabled: true })
  assert.deepEqual(actions, ['config', 'register'])
  assert.equal(calls.length, 0, 'an existing browser subscription is reused')
})

test('an accepted permission creates a browser subscription when none exists', async () => {
  const createdSubscription = {
    endpoint: 'https://push.example/new-endpoint',
    toJSON: () => ({ endpoint: 'https://push.example/new-endpoint', keys: { p256dh: 'p'.repeat(50), auth: 'a'.repeat(20) } }),
  }
  const calls = browserFixture({ permission: 'granted', subscription: null, createdSubscription })
  const requests = []
  globalThis.__pushInvoke = async (_name, { body }) => {
    requests.push(body)
    return { data: body.action === 'config' ? { ok: true, publicKey: 'AQID' } : { ok: true }, error: null }
  }
  const result = await pushClient.enablePushNotifications({ playerKey: 'guest:adam', sessionToken: 'session' })
  assert.deepEqual(result, { permission: 'granted', enabled: true })
  assert.equal(calls.length, 1)
  assert.equal(calls[0][1].userVisibleOnly, true)
  assert.deepEqual([...calls[0][1].applicationServerKey], [1, 2, 3])
  assert.equal(requests[1].subscription.endpoint, createdSubscription.endpoint)
})

test('disabling notifications revokes the proven device before local unsubscribe', async () => {
  const order = []
  const subscription = {
    endpoint: 'https://push.example/endpoint',
    unsubscribe: async () => { order.push('unsubscribe'); return true },
  }
  browserFixture({ permission: 'granted', subscription })
  globalThis.__pushInvoke = async (_name, { body }) => {
    order.push(body.action)
    assert.equal(body.playerKey, 'guest:adam')
    assert.equal(body.sessionToken, 'session')
    assert.equal(body.subscription.endpoint, subscription.endpoint)
    return { data: { ok: true }, error: null }
  }
  await pushClient.disablePushNotifications({ playerKey: 'guest:adam', sessionToken: 'session' })
  assert.deepEqual(order, ['revoke', 'unsubscribe'])
})

test('missing service worker support is reported as unsupported', () => {
  browserFixture()
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} })
  assert.equal(pushClient.getPushAvailability({ platform: 'android', installed: false }), 'unsupported')
})

test('service worker template handles push and notification clicks with an internal route allow-list', async () => {
  const worker = await readFile(new URL('../src/pwa/sw-template.js', import.meta.url), 'utf8')
  const badge = await readFile(new URL('../public/pwa/notification-badge.svg', import.meta.url), 'utf8')
  assert.match(worker, /addEventListener\('push'/)
  assert.match(worker, /registration\.showNotification/)
  assert.match(worker, /badge: '\/pwa\/notification-badge\.svg'/)
  assert.match(worker, /addEventListener\('notificationclick'/)
  assert.match(worker, /url\.origin === self\.location\.origin && NOTIFICATION_ROUTES\.has\(url\.pathname\)/)
  assert.match(worker, /existing\.focus\(\)/)
  assert.match(worker, /clients\.openWindow\(destination\)/)
  assert.match(badge, /viewBox="0 0 96 96"/)
  assert.doesNotMatch(badge, /<rect[^>]+width="96"[^>]+height="96"/)
})

test('service worker displays push payloads and rejects arbitrary click destinations', async () => {
  const source = (await readFile(new URL('../src/pwa/sw-template.js', import.meta.url), 'utf8'))
    .replace('__PRECACHE_URLS__', '[]')
  const listeners = new Map()
  const shown = []
  const navigated = []
  let focused = 0
  const client = {
    url: 'https://anniv.test/admin',
    visibilityState: 'visible',
    navigate: async url => { navigated.push(url); client.url = url },
    focus: async () => { focused++; return client },
  }
  const self = {
    location: { origin: 'https://anniv.test' },
    registration: { showNotification: async (...args) => { shown.push(args) } },
    clients: {
      claim: async () => undefined,
      matchAll: async () => [client],
      openWindow: async () => undefined,
    },
    addEventListener: (name, handler) => listeners.set(name, handler),
    skipWaiting: () => undefined,
  }
  const caches = { open: async () => ({ add: async () => undefined, put: async () => undefined }), keys: async () => [], match: async () => null, delete: async () => true }
  vm.runInNewContext(source, { self, caches, URL, Response, fetch: async () => new Response(), Promise, Set })

  let pushWork
  listeners.get('push')({
    data: { json: () => ({ title: 'Test', body: 'OK', route: 'https://evil.example/steal', tag: 'test' }) },
    waitUntil: promise => { pushWork = promise },
  })
  await pushWork
  assert.equal(shown[0][0], 'Test')
  assert.equal(shown[0][1].data.route, '/')

  listeners.get('push')({
    data: { json: () => ({ title: 'Annonce', body: 'Visible', route: '/', suppressWhenVisible: true }) },
    waitUntil: promise => { pushWork = promise },
  })
  await pushWork
  assert.equal(shown.length, 1, 'a visible app already displays the live announcement')

  client.visibilityState = 'hidden'
  listeners.get('push')({
    data: { json: () => ({ title: 'Annonce', body: 'Arrière-plan', route: '/', suppressWhenVisible: true }) },
    waitUntil: promise => { pushWork = promise },
  })
  await pushWork
  assert.equal(shown.length, 2, 'a background app receives the system notification')

  let clickWork
  listeners.get('notificationclick')({
    notification: { data: { route: '/beer-pong' }, close: () => undefined },
    waitUntil: promise => { clickWork = promise },
  })
  await clickWork
  assert.deepEqual(navigated, ['https://anniv.test/beer-pong'])
  assert.equal(focused, 1)
})
