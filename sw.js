// 喵码 Service Worker — 离线缓存 + 平滑更新
const CACHE_NAME = 'miaosite-v3';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/404.html',
    '/styles/base.css?v=2',
    '/styles/auth.css',
    '/lib/jsbarcode.min.js?v=1',
    '/lib/miaosite-auth.js',
];

function cacheSuccessfulResponse(request, response) {
    if (!response || response.status !== 200) return response;
    const clone = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(request, clone)).catch(() => {});
    return response;
}

function cacheFirstWithRefresh(request) {
    return caches.match(request).then(cached => {
        const network = fetch(request)
            .then(response => cacheSuccessfulResponse(request, response))
            .catch(() => cached);
        return cached || network;
    });
}

function networkFirstPage(request) {
    return fetch(request)
        .then(response => cacheSuccessfulResponse(request, response))
        .catch(() => caches.match(request).then(cached => cached || caches.match('/index.html')));
}

// 安装：逐个预缓存核心资源，单个失败不影响整批缓存
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return Promise.all(
                STATIC_ASSETS.map(asset => cache.add(asset).catch(() => {}))
            );
        })
    );
    self.skipWaiting();
});

// 激活：清理旧缓存
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            );
        })
    );
    self.clients.claim();
});

// 请求拦截：缓存策略
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    if (event.request.method !== 'GET') return;

    // API 请求：网络优先，失败时返回离线提示
    if (url.pathname.startsWith('/api/')) {
        return; // API 不缓存，直接走网络
    }

    if (event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html')) {
        event.respondWith(networkFirstPage(event.request));
        return;
    }

    event.respondWith(cacheFirstWithRefresh(event.request));
});
