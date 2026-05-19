const CACHE_NAME = 'id-scanner-v2.0.0'; // 更新版本號以觸發 PWA 強制更新
const urlsToCache = [
    './',
    './manifest.json',
    './icon.svg',
    'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs',
    'https://docs.opencv.org/4.8.0/opencv.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
});

self.addEventListener('fetch', event => {
    // 只攔截 GET 請求 (影像處理的 POST API 必須透過網路)
    if (event.request.method !== 'GET') return;
    
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                // 1. 如果快取裡有檔案 (如 HTML, OpenCV.js)，直接秒速回傳
                if (cachedResponse) {
                    return cachedResponse;
                }
                // 2. 如果快取沒有 (例如 YOLO 的 model.json 或 .bin 檔)，去網路下載，並順手存入快取供未來離線使用
                return fetch(event.request).then(networkResponse => {
                    return caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });
                });
            })
    );
});