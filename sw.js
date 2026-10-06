/* オフラインでも開けるようにアプリ本体をキャッシュ（HTTPS / localhost のときのみ有効） */
const CACHE = 'recipe-note-v9';
const ASSETS = [
  './', './index.html', './css/style.css',
  './js/db.js', './js/cloud-config.js', './js/sync.js', './js/parser.js', './js/samples.js', './js/app.js',
  './manifest.webmanifest', './assets/icon-192.png', './assets/apple-touch-icon.png',
  './assets/samples/cover.jpg', './assets/samples/carbonara.jpg', './assets/samples/hamburg.jpg',
  './assets/samples/okonomiyaki.jpg', './assets/samples/burger.jpg', './assets/samples/dalgona.jpg',
  './assets/samples/banana.jpg', './assets/samples/pumpkin.jpg', './assets/samples/chiffon.jpg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

/* 最新版を取りに行き、オフライン時はキャッシュを返す */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).hostname.endsWith('.supabase.co')) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok && (e.request.url.startsWith(self.location.origin) || e.request.url.includes('fonts.g'))) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
