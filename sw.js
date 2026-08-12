// 梦幻西餐厅2 · Service Worker（PWA 离线缓存）
const CACHE = 'dr2-v2';
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
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request).catch(() => caches.match('./index.html')))
  );
});
