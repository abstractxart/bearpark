// 🐻❄️ COCAINE BEAR: Optimized Service Worker with Smart Caching
const CACHE_VERSION = 'bearpark-v3';
const STATIC_CACHE = CACHE_VERSION + '-static';
const DYNAMIC_CACHE = CACHE_VERSION + '-dynamic';

// Assets to precache for offline/fast loading
const PRECACHE_ASSETS = [
  '/',
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/android-chrome-192x192.png'
];

// Cache strategies
const CACHE_FIRST_PATTERNS = [
  /\.(png|jpg|jpeg|gif|webp|svg|ico)$/i,
  /\.(woff|woff2|ttf|otf|eot)$/i,
  /fonts\.googleapis\.com/,
  /fonts\.gstatic\.com/,
  /files\.catbox\.moe/
];

const NETWORK_FIRST_PATTERNS = [
  /\/api\//,
  /supabase/
];

// Install: Precache critical assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: Clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
            .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Smart caching strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip cross-origin requests except for allowed CDNs
  if (url.origin !== self.location.origin &&
      !url.hostname.includes('catbox.moe') &&
      !url.hostname.includes('googleapis.com') &&
      !url.hostname.includes('gstatic.com') &&
      !url.hostname.includes('jsdelivr.net') &&
      !url.hostname.includes('unpkg.com')) {
    return;
  }

  // Network-first for API calls
  if (NETWORK_FIRST_PATTERNS.some(p => p.test(request.url))) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Don't cache non-ok responses
          if (!response.ok) return response;
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Cache-first for static assets
  if (CACHE_FIRST_PATTERNS.some(p => p.test(request.url))) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;

        return fetch(request).then(response => {
          if (!response.ok) return response;

          const clone = response.clone();
          caches.open(DYNAMIC_CACHE).then(cache => {
            cache.put(request, clone);
          });
          return response;
        });
      })
    );
    return;
  }

  // Stale-while-revalidate for HTML
  const acceptHeader = request.headers.get('accept');
  if (acceptHeader && acceptHeader.includes('text/html')) {
    event.respondWith(
      caches.match(request).then(cached => {
        const fetchPromise = fetch(request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(DYNAMIC_CACHE).then(cache => {
              cache.put(request, clone);
            });
          }
          return response;
        }).catch(() => cached);

        return cached || fetchPromise;
      })
    );
    return;
  }
});
