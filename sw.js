const CACHE_NAME = 'id-scanner-v2.1.2'; // 更新版本號以觸發 PWA 強制更新
const urlsToCache = [
    './',
    './index.html',
    './css/styles.css',
    './js/app.js',
    './js/state.js',
    './js/ui.js',
    './js/image-loader.js',
    './js/canvas-editor.js',
    './js/pdf-export.js',
    './js/detection/opencv.js',
    './js/detection/yolo.js',
    './manifest.json',
    './icon.svg',
    './icon-192.png',
    './icon-512.png',
    'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs',
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
                // 2. 如果快取沒有，去網路下載，並順手存入快取供未來離線使用。
                // YOLO 模型不在 install 階段預抓，避免首次開啟時和頁面背景載入重複下載。
                return fetch(event.request).then(networkResponse => {
                    return caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });
                });
            })
    );
});
