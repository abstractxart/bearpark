// NUCLEAR OPTION: Service Worker DISABLED
// This SW does NOTHING - it just unregisters itself

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Unregister this service worker
  event.waitUntil(
    self.registration.unregister().then(() => {
      console.log('Service Worker unregistered');
    })
  );
});

// DO NOT INTERCEPT ANY FETCH REQUESTS
// Let the browser handle everything naturally
