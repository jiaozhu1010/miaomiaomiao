// 喵码 Service Worker — 离线缓存 + 秒开
const CACHE_NAME = 'miaosite-v2';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/tools.html',
    '/knowledge.html',
    '/404.html',
    '/server.js', // 不缓存API，仅用于预缓存判断
];

// 安装：预缓存核心页面
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(STATIC_ASSETS).catch(() => {});
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

    // API 请求：网络优先，失败时返回离线提示
    if (url.pathname.startsWith('/api/')) {
        return; // API 不缓存，直接走网络
    }

    // SSG/静态资源：缓存优先（Cache First）
    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;
            return fetch(event.request).then(response => {
                // 只缓存成功的 GET 请求
                if (event.request.method === 'GET' && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            }).catch(() => {
                // 离线时返回缓存，HTML请求返回首页
                if (event.request.headers.get('accept')?.includes('text/html')) {
                    return caches.match('/index.html');
                }
            });
        })
    );
});
