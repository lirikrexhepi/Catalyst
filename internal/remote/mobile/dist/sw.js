const CACHE = 'orchestrator-shell-v1'
const SHELL = '/index.html'
const NETWORK_TIMEOUT = 4000

async function precache() {
  const cache = await caches.open(CACHE)
  const response = await fetch('/', { cache: 'no-store' })
  if (!response.ok) return
  const html = await response.text()
  await cache.put(SHELL, new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
  const assets = [...html.matchAll(/(?:\.\/|\/)(assets\/[^"'\s>]+)/g)].map((m) => '/' + m[1])
  await Promise.all(
    [...assets, '/icon-192.png', '/manifest.json'].map((path) =>
      fetch(path)
        .then((r) => (r.ok ? cache.put(path, r) : undefined))
        .catch(() => undefined),
    ),
  )
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().catch(() => undefined).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

async function pruneAssets(cache, html) {
  const keep = new Set()
  for (const match of html.matchAll(/(?:\.\/|\/)(assets\/[^"'\s>]+)/g)) keep.add('/' + match[1])
  if (keep.size === 0) return
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname
    if (path.startsWith('/assets/') && /\.(js|css)$/.test(path) && !keep.has(path)) await cache.delete(req)
  }
}

async function navigate(request) {
  const cache = await caches.open(CACHE)
  try {
    const response = await withTimeout(fetch(request), NETWORK_TIMEOUT)
    if (response.ok) {
      const html = await response.clone().text()
      await cache.put(SHELL, new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
      await pruneAssets(cache, html)
      return response
    }
    if (response.status >= 500) return (await cache.match(SHELL)) || response
    return response
  } catch (err) {
    const cached = await cache.match(SHELL)
    if (cached) return cached
    throw err
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request, { ignoreSearch: true })
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) await cache.put(request, response.clone())
  return response
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request, { ignoreSearch: true })
  const fresh = fetch(request)
    .then(async (response) => {
      if (response.ok) await cache.put(request, response.clone())
      return response
    })
    .catch(() => cached)
  return cached || fresh
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return
  if (request.mode === 'navigate') {
    event.respondWith(navigate(request))
  } else if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/file-icons/')) {
    event.respondWith(cacheFirst(request))
  } else {
    event.respondWith(staleWhileRevalidate(request))
  }
})

function setBadge(count) {
  const nav = self.navigator
  if (typeof count !== 'number' || !nav) return Promise.resolve()
  if (count > 0 && nav.setAppBadge) return nav.setAppBadge(count).catch(() => undefined)
  if (count <= 0 && nav.clearAppBadge) return nav.clearAppBadge().catch(() => undefined)
  return Promise.resolve()
}

self.addEventListener('push', (event) => {
  let msg = {}
  try {
    msg = event.data ? event.data.json() : {}
  } catch {
    msg = { body: event.data ? event.data.text() : '' }
  }
  const options = {
    body: msg.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: msg.url || '/' },
  }
  if (msg.tag) {
    options.tag = msg.tag
    options.renotify = true
  }
  event.waitUntil(
    Promise.all([self.registration.showNotification(msg.title || 'Orchestrator', options), setBadge(msg.badge)]),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        if ('focus' in client) {
          await client.focus()
          client.postMessage({ type: 'open', url })
          return
        }
      }
      await self.clients.openWindow(url)
    })(),
  )
})
