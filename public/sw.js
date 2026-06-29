/* Service worker — Nissab du Jour
   Augmentez la version du cache à chaque mise à jour des fichiers. */
const CACHE = 'nissab-v2';
const ASSETS = [
  '/',
  '/style.css',
  '/app.js',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Les données dynamiques passent toujours par le réseau (cours frais).
  if (url.pathname.startsWith('/api/')) return;

  // Pages : réseau d'abord, cache en secours (utile hors ligne).
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); return r; })
        .catch(() => caches.match(req).then((r) => r || caches.match('/')))
    );
    return;
  }

  // Autres ressources : cache d'abord, réseau ensuite.
  e.respondWith(
    caches.match(req).then((r) => r || fetch(req).then((rr) => {
      const cp = rr.clone();
      caches.open(CACHE).then((c) => c.put(req, cp));
      return rr;
    }))
  );
});
