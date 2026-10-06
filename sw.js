/* オフラインでも開けるようにアプリ本体をキャッシュ（HTTPS / localhost のときのみ有効） */
const CACHE = 'recipe-note-v12';
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

/* 端末内のキャッシュですぐ表示し、裏で最新版を取りに行って次回に備える（起動を待たせない） */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;
  if (new URL(url).hostname.endsWith('.supabase.co')) return;
  const cacheable = url.startsWith(self.location.origin) || url.includes('fonts.g');
  if (!cacheable) return;
  const update = fetch(e.request).then(res => {
    // 公開サイトにない追加レシピのファイル（404）も覚えておき、毎回ネットを待たないようにする
    if (res.ok || (res.status === 404 && url.startsWith(self.location.origin))) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
    }
    return res;
  });
  e.waitUntil(update.then(() => {}, () => {}));
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || update));
});
