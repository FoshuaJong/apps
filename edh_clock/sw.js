const CACHE = 'edh-clock-v1';
const PRECACHE = [
  '/edh_clock/',
  '/edh_clock/index.html',
  '/css/variables.css',
  '/css/base.css',
  '/css/apps.css',
  '/images/favicon.svg',
  'https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=JetBrains+Mono:wght@300;400;500&family=Outfit:wght@300;400;500&display=swap',
  'https://cdn.jsdelivr.net/npm/qrious@4.0.2/dist/qrious.min.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Never intercept Worker API or WebSocket upgrade requests
  if (url.pathname.startsWith('/edh/')) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      const fresh = fetch(e.request).then(res => {
        if (res.ok && res.type !== 'opaque') {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }
        return res;
      }).catch(() => cached);
      return cached || fresh;
    })
  );
});
