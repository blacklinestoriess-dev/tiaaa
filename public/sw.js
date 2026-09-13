// Self-cleaning kill-switch Service Worker for Tia applet
// Immediately activates, unregisters itself, and clears all stale caches without intercepting any network requests.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.claim())
  );
});

// No 'fetch' event listener is attached.
// All network requests pass directly to the network/server without caching or interference.

