// 梦幻西餐厅2 · Service Worker（PWA 离线缓存）
// 策略：stale-while-revalidate（先返回缓存，后台静默更新）→ 既快又有离线，且升级后不会永久卡在旧版
const CACHE = 'dr2-v6';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/main.css',
  './css/ui.css',
  './css/restaurant.css',
  './js/main.js',
  './js/state.js',
  './js/save.js',
  './js/ui.js',
  './js/renderer.js',
  './js/game.js',
  './js/time.js',
  './js/customer.js',
  './js/staff.js',
  './js/kitchen.js',
  './js/menu.js',
  './js/rating.js',
  './js/restaurant.js',
  './js/types.js',
  './config/dishes.json',
  './config/staff.json',
  './config/game-config.json',
  './assets/icons/icon.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request).then((resp) => {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return resp;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
