/* IRONBELL service worker.
 *
 * Network-first for the page itself, cache-first for the icons.
 *
 * The usual mistake is cache-first for everything: the gym works offline but
 * the app then freezes on whatever version happened to be cached, and a fix
 * shipped weeks ago never arrives. Going to the network first and falling back
 * to the cache gives both — the newest build whenever there is signal, and the
 * last good build in a basement with none.
 *
 * Bump CACHE on every deploy. Old caches are deleted on activate, so an update
 * never leaves two versions fighting over the same origin.
 */
const CACHE = 'ironbell-v8';
const SHELL = ['./', './index.html', './manifest.json',
               './icon-180.png', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // one missing icon must not fail the whole install, so each is added on its own
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null))))
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
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // fonts and anything else stay untouched

  const isPage = req.mode === 'navigate' ||
                 (req.headers.get('accept') || '').includes('text/html');

  if (isPage) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => hit))
  );
});
