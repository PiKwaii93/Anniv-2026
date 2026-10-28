const VERSION = '__BUILD_ID__'
const STATIC_CACHE = `anniv-2026-static-${VERSION}`
const SHELL_CACHE = `anniv-2026-shell-${VERSION}`
const PRECACHE_URLS = __PRECACHE_URLS__
const NETWORK_ONLY_PREFIXES = ['/screen', '/admin', '/captain', '/qr']
const NOTIFICATION_ROUTES = new Set(['/', '/beer-pong', '/missions'])

function isNetworkOnlyPath(pathname) {
  return NETWORK_ONLY_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => Promise.allSettled(
      PRECACHE_URLS.map(url => cache.add(url)),
    )),
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('anniv-2026-') && key !== STATIC_CACHE && key !== SHELL_CACHE)
          .map(key => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

function safeNotificationRoute(value) {
  if (typeof value !== 'string') return '/'
  try {
    const url = new URL(value, self.location.origin)
    return url.origin === self.location.origin && NOTIFICATION_ROUTES.has(url.pathname)
      ? `${url.pathname}${url.search}${url.hash}`
      : '/'
  } catch {
    return '/'
  }
}

self.addEventListener('push', event => {
  let payload = {}
  try { payload = event.data?.json() ?? {} } catch { payload = {} }
  const notification = payload.notification ?? payload
  const title = typeof notification.title === 'string' ? notification.title : 'Anniv 2026'
  const body = typeof notification.body === 'string' ? notification.body : 'Tu as une nouvelle notification.'
  const route = safeNotificationRoute(payload.route ?? notification.navigate)
  const suppressWhenVisible = payload.suppressWhenVisible === true
    || notification.suppressWhenVisible === true
  event.waitUntil((async () => {
    if (suppressWhenVisible) {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      if (clients.some(client => client.visibilityState === 'visible')) return
    }

    await self.registration.showNotification(title, {
      body,
      icon: '/pwa/icon-192.png',
      badge: '/pwa/notification-badge.svg',
      tag: typeof notification.tag === 'string' ? notification.tag : 'anniv-2026',
      data: { route },
    })
  })())
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const route = safeNotificationRoute(event.notification.data?.route)
  const destination = new URL(route, self.location.origin).href
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
    const existing = clients[0]
    if (existing) {
      if ('navigate' in existing && existing.url !== destination) await existing.navigate(destination)
      return existing.focus()
    }
    return self.clients.openWindow(destination)
  }))
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (isNetworkOnlyPath(url.pathname)) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(async response => {
          if (response.ok) {
            const copy = response.clone()
            await caches.open(SHELL_CACHE).then(cache => cache.put('/index.html', copy))
          }
          return response
        })
        .catch(async () => (await caches.match('/index.html')) || Response.error()),
    )
    return
  }

  if (url.pathname.startsWith('/assets/') || PRECACHE_URLS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(async response => {
        if (!response.ok) return response
        const copy = response.clone()
        await caches.open(STATIC_CACHE).then(cache => cache.put(request, copy))
        return response
      })),
    )
  }
})
