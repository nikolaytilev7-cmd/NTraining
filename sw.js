/* NT Training service worker.
 *
 * Network-first for the page itself, cache-first for everything else.
 * The page always comes from the network when there is signal, so a new build
 * shows up on the next launch; the cache is the fallback for the gym basement.
 *
 * CACHE and PHOTOS are rewritten on every build (integrate2.py). Old caches are
 * deleted on activate, so two versions never fight over the same origin.
 */
const CACHE = 'nt-training-v70';
const PHOTOS = './photos.js?v=2026-09-26e';
/* The icons carry a version in their FILENAME: iOS keeps its own copy of a
   home-screen icon that no cache header reaches. Rename on every icon change. */
const SHELL = ['./index.html', './manifest.json', PHOTOS,
               './icon-180-v3.png', './icon-192-v3.png', './icon-512-v3.png', './icon-512-maskable-v3.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // 'reload' skips the browser's HTTP cache, so a new build never precaches last build's files;
      // one missing file must not fail the whole install, so each is added on its own
      .then(c => Promise.all(SHELL.map(u => c.add(new Request(u, {cache: 'reload'})).catch(() => null))))
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

function isGoodPage(res) {
  // never store an error page, a redirect or a captive-portal login as "the app"
  return res && res.ok && res.type === 'basic' && !res.redirected &&
         (res.headers.get('content-type') || '').includes('text/html');
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // fonts and anything else stay untouched

  const isPage = req.mode === 'navigate' ||
                 (req.headers.get('accept') || '').includes('text/html');

  if (isPage) {
    // only the app itself is stored as the app; welcome.html keeps its own entry
    const isApp = /\/(index\.html)?$/.test(url.pathname);
    e.respondWith(
      fetch(req)
        .then(res => {
          if (isGoodPage(res)) {
            const copy = res.clone();
            e.waitUntil(caches.open(CACHE).then(c => c.put(isApp ? './index.html' : req, copy)));
          }
          return res;
        })
        .catch(() => (isApp ? caches.match('./index.html') : caches.match(req, {ignoreSearch: true}))
          .then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // exact match: photos.js?v=BUILD is a different file from last build's photos.js?v=OLD
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        e.waitUntil(caches.open(CACHE).then(c => c.put(req, copy)));
      }
      return res;
    }).catch(() => caches.match(req, {ignoreSearch: true})))
  );
});
