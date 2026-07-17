const CACHE_NAME = 'soka-bus-nav-v1';
const ASSETS = [
  './inex.html',
  './style.css',
  './script.js',  // もしコンパイル後の名前が異なれば修正してください
  './timetable.json'
];

// ① インストール時に主要ファイルをキャッシュに保存
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// ② アプリのバージョンアップ時に古いキャッシュを自動削除
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// ③ 画面を開いた時、ネットワークではなくキャッシュから爆速で読み込む
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      // キャッシュがあればそれを返し、無ければネットワークから取得
      return cachedResponse || fetch(e.request);
    })
  );
});