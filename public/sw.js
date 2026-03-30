// Service worker: hapus semua cache saat ada versi baru
const VERSION = 'v__BUILD__';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Passthrough — tidak cache apapun
  e.respondWith(fetch(e.request, { cache: 'no-store' }));
});
