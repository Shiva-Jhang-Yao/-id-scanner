const CACHE_NAME = 'id-scanner-v2.0.6'; // 更新版本號以觸發 PWA 強制更新
const urlsToCache = [
    './',
    './index.html',
    './manifest.json',
    './icon.svg',
    './model_web/model.json',
    './model_web/metadata.yaml',
    './model_web/group1-shard1of4.bin',
    './model_web/group1-shard2of4.bin',
    './model_web/group1-shard3of4.bin',
    './model_web/group1-shard4of4.bin',
    'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://docs.opencv.org/4.8.0/opencv.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys
                .filter(key => key !== CACHE_NAME)
                .map(key => caches.delete(key))
        ))
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
