// ISBN 掃描器的 Service Worker：讓頁面加入主畫面後可離線開啟。
// 策略：stale-while-revalidate —— 先回快取（離線也能開），背景再抓新版更新快取。
// 改了檔案想讓手機立刻吃到新版，把 VERSION 加一。

const VERSION = 'v1';
const CACHE = `isbn-scanner-${VERSION}`;
const LIB = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
const PRECACHE = ['./', './app.js', './isbn.js', './manifest.webmanifest', './icon.svg', LIB];

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
      const cached = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached ?? network;
    }),
  );
});
