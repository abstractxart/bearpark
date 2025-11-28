// BEAR Park Service Worker - Push Notifications & Offline Support
const CACHE_NAME = 'bearpark-v7'; // FIX: Stop returning error pages on iOS scroll
const API_URL = 'https://bearpark.xyz'; // Change to your production URL

// Install event - cache essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        '/main.html',
        '/android-chrome-192x192.png',
        '/android-chrome-512x512.png',
        '/favicon.ico'
      ]).catch(() => {
        // Silent fail - don't spam console in production
      });
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip chrome-extension and other non-http(s) requests
  if (!event.request.url.startsWith('http')) return;

  // Skip external APIs (CoinGecko, etc) - let browser handle them
  const requestUrl = new URL(event.request.url);
  const isExternalAPI = !requestUrl.hostname.includes('bearpark') &&
                        !requestUrl.hostname.includes('railway.app') &&
                        !requestUrl.hostname.includes('localhost');

  if (isExternalAPI) {
    return; // Don't intercept external APIs
  }

  // Skip WebSocket URLs
  if (event.request.url.includes('wss://') || event.request.url.includes('ws://')) {
    return;
  }

  // NEVER cache API calls - let them fail silently if network error
  if (event.request.url.includes('/api/')) {
    // Don't intercept - let browser handle API errors naturally
    return;
  }

  // Only intercept navigation and asset requests
  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) {
        return response;
      }

      // Fetch from network - don't return error page, just let it fail naturally
      return fetch(event.request);
    }).catch(() => {
      // On error, don't return anything - let browser handle it
      return fetch(event.request);
    })
  );
});

// Push notification event - show raid notifications
self.addEventListener('push', (event) => {

  let notificationData = {
    title: '🐻 BEAR Park',
    body: 'New notification!',
    icon: '/android-chrome-192x192.png',
    badge: '/favicon-32x32.png',
    vibrate: [200, 100, 200],
    tag: 'bearpark-notification'
  };

  // Parse push data if available
  if (event.data) {
    try {
      const data = event.data.json();

      if (data.type === 'raid') {
        notificationData = {
          title: `🎯 ${data.raid_name || 'New BEAR Raid!'}`,
          body: `${data.creator_name || 'A BEAR'} started a raid! Tap to join and earn honey points! 🍯`,
          icon: '/android-chrome-512x512.png',
          badge: '/favicon-32x32.png',
          vibrate: [200, 100, 200, 100, 200],
          tag: 'raid-' + data.raid_id,
          data: {
            url: '/main.html#honey-points',
            raid_id: data.raid_id
          },
          actions: [
            {
              action: 'join',
              title: '🍯 Join Raid',
              icon: '/android-chrome-192x192.png'
            },
            {
              action: 'close',
              title: 'Dismiss'
            }
          ],
          requireInteraction: true
        };
      } else if (data.type === 'points') {
        notificationData = {
          title: '🍯 Honey Points Earned!',
          body: `You earned ${data.points} honey points! 🎉`,
          icon: '/android-chrome-192x192.png',
          badge: '/favicon-32x32.png',
          vibrate: [200, 100, 200],
          tag: 'points-earned',
          data: {
            url: '/main.html#honey-points'
          }
        };
      } else {
        // Generic notification
        notificationData.title = data.title || notificationData.title;
        notificationData.body = data.body || notificationData.body;
        notificationData.data = data;
      }
    } catch (err) {
      // Silent fail - don't spam console in production
    }
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, notificationData)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Handle action buttons
  if (event.action === 'close') {
    return;
  }

  // Get URL from notification data
  const urlToOpen = event.notification.data?.url || '/main.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if app is already open
      for (let client of clientList) {
        if (client.url.includes('bearpark') && 'focus' in client) {
          client.focus();
          client.navigate(urlToOpen);
          return;
        }
      }
      // Open new window if not already open
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
