// Minimal service worker: makes the app installable and shows a friendly page when offline.
// It never caches API responses or broker data.
const SHELL = 'md-shell-v1';
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/styles.css', '/app.js', '/icon.svg'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // network first, fall back to the cached shell
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok && (url.pathname === '/' || /\.(js|css|svg|png)$/.test(url.pathname))) {
      const copy = r.clone();
      caches.open(SHELL).then((c) => c.put(e.request, copy));
    }
    return r;
  }).catch(() => caches.match(e.request).then((m) => m || caches.match('/'))));
});
