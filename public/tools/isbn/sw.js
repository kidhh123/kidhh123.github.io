// ISBN 掃描器的 Service Worker：讓頁面加入主畫面後可離線開啟。
// 策略：自己的檔案網路優先（改版立刻生效、離線用快取）；固定版本的 CDN 檔快取優先。
// 預先快取清單有變動時，把 VERSION 加一。

const VERSION = 'v2';
const CACHE = `isbn-scanner-${VERSION}`;
const LIB = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
const PRECACHE = ['./', './app.js', './isbn.js', './scanner.js', './manifest.webmanifest', './icon.svg', LIB];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('isbn-scanner-') && k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const inScope = url.href.startsWith(self.registration.scope) || url.href === LIB;
  if (!inScope) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const opts = { ignoreSearch: req.mode === 'navigate' };
      // 固定版本的 CDN 檔不會變：快取優先
      if (url.href === LIB) {
        const hit = await cache.match(req);
        if (hit) return hit;
      }
      // 自己的檔案：網路優先（改版立刻生效），離線才用快取
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (err) {
        const hit = await cache.match(req, opts);
        if (hit) return hit;
        throw err;
      }
    }),
  );
});
