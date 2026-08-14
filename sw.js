/* ==========================================================================
   sw.js — offline shell, honest by design

   NETWORK-FIRST for everything same-origin. The CSS/JS filenames carry no
   content hash, so serving them from cache after a deploy would pair a
   fresh index.html with stale scripts and kill the app — that bug already
   happened once via HTTP caching, and the service worker must not reinvent
   it. The cache is only a parachute: it answers when the network cannot.

   /api/* is never cached — quotes must be live or absent, never stale.
   Cross-origin (TradingView, fonts, CDNs) is left to the browser.
   ========================================================================== */
var CACHE = 'mc-shell-v1';

var SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'assets/logo.svg',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== location.origin) return;          // third parties: browser's business
  if (url.pathname.indexOf('/api/') === 0) return;     // live data is live or nothing

  e.respondWith(
    fetch(req)
      .then(function (res) {
        // stash a copy so the shell still opens with no network
        if (res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      })
      .catch(function () {
        return caches.match(req).then(function (hit) {
          // a navigation with no cache hit still deserves the app shell
          return hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error());
        });
      })
  );
});
