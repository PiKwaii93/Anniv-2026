const VERSION = '__BUILD_ID__'
const STATIC_CACHE = `anniv-2026-static-${VERSION}`
const SHELL_CACHE = `anniv-2026-shell-${VERSION}`
const PRECACHE_URLS = __PRECACHE_URLS__
const NETWORK_ONLY_PREFIXES = ['/screen', '/admin', '/captain', '/qr']

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
