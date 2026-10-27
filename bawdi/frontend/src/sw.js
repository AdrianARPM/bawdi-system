/* src/sw.js — Service Worker BAWDI (precache + runtime cache + Web Push)
   Dibangun oleh vite-plugin-pwa (strategies: injectManifest) */
import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Setelah SW baru AKTIF (via SKIP_WAITING di bawah), langsung ambil kendali semua
// tab yang terbuka. Tanpa ini, event 'controllerchange' bisa tidak terpicu, sehingga
// tombol "Muat Ulang" seolah tak bekerja dan user harus refresh manual.
clientsClaim();

// ── Runtime caching (paritas dgn konfigurasi generateSW sebelumnya) ──
registerRoute(
  /^https:\/\/.*\/api\/.*/i,
  new NetworkFirst({
    cacheName: 'bawdi-api-cache',
    networkTimeoutSeconds: 10,
    plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 })],
  })
);
registerRoute(
  /\.(png|jpg|jpeg|svg|gif|webp|ico)$/,
  new CacheFirst({
    cacheName: 'bawdi-assets-cache',
    plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  })
);
registerRoute(
  /^https:\/\/fonts\.googleapis\.com\/.*/i,
  new StaleWhileRevalidate({ cacheName: 'bawdi-fonts-cache' })
);

// ── Mode 'prompt': SW baru menunggu sampai user menekan "Muat Ulang" ──
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Web Push: tampilkan notifikasi walau app tidak dibuka ──
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch { data = { body: event.data ? event.data.text() : '' }; }

  const title = data.title || 'BAWDI';
  event.waitUntil(self.registration.showNotification(title, {
    body:  data.body || '',
    icon:  '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data:  { url: data.submissionId ? `/submissions/${data.submissionId}` : '/' },
  }));
});

// ── Klik notifikasi → buka/fokuskan app di halaman pengajuannya ──
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) { client.navigate(url); return client.focus(); }
      }
      return self.clients.openWindow(url);
    })
  );
});
