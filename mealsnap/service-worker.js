const CACHE = 'mealsnap-v1.0.1';
const SHELL = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png',
  './src/app.js', './src/util.js', './src/icons.js', './src/db.js', './src/lazy.js', './src/image.js',
  './src/meals.js', './src/ui.js', './src/camera.js', './src/viewer.js', './src/backup.js',
  './src/storage.js', './src/flows.js', './src/prefs.js', './src/nav.js', './src/banner.js',
  './src/views/calendar.js', './src/views/day.js', './src/views/timeline.js', './src/views/settings.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('mealsnap-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// 앱 파일은 캐시 우선(오프라인 동작), 버전을 올리면 새 캐시로 교체된다.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit =>
    hit || fetch(e.request).catch(() =>
      e.request.mode === 'navigate' ? caches.match('./index.html') : new Response('', { status: 504 }))));
});
