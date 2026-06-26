const assert = require('assert');
const puppeteer = require('puppeteer');

const BASE_URL = process.env.MIAOSITE_TEST_URL || 'http://localhost:3000/';

const EXPECTED_BUSTED_ASSETS = [
    '/styles/base.css',
    '/styles/auth.css',
    '/styles/raindrop-overlay.css',
    '/lib/highlight-github.min.css',
    '/lib/katex.min.css',
    '/lib/gsap.min.js',
    '/lib/ScrollTrigger.min.js',
    '/lib/jsbarcode.min.js',
    '/lib/weather-state.js',
    '/lib/raindrop-fx.js',
    '/lib/raindrop-overlay.js',
    '/lib/marked.min.js',
    '/lib/highlight.min.js',
    '/lib/katex.min.js',
    '/lib/miaosite-auth.js',
];

async function run() {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
        const page = await browser.newPage();
        await page.setCacheEnabled(true);
        await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
        await page.goto(`${BASE_URL}?titlebar_cache_refresh_check=1`, {
            waitUntil: 'networkidle2',
            timeout: 30000,
        });
        await page.waitForSelector('.nav-bar #force-cache-refresh', { timeout: 10000 });

        const seededState = await page.evaluate(async () => {
            const cache = await caches.open('miaosite-test-stale-cache');
            await cache.put('/__cache-refresh-test.txt', new Response('stale-cache-entry'));

            const registration = await Promise.race([
                navigator.serviceWorker.ready,
                new Promise(resolve => setTimeout(() => resolve(null), 5000)),
            ]);
            const cacheNames = await caches.keys();
            const registrations = await navigator.serviceWorker.getRegistrations();

            return {
                hasTitlebarButton: !!document.querySelector('.nav-bar #force-cache-refresh'),
                seededCacheExists: cacheNames.includes('miaosite-test-stale-cache'),
                serviceWorkerReady: !!registration,
                registrationCount: registrations.length,
            };
        });

        assert.strictEqual(seededState.hasTitlebarButton, true, 'cache refresh control must live in the title bar');
        assert.strictEqual(seededState.seededCacheExists, true, 'test must seed a stale Cache Storage entry before clicking');
        assert.strictEqual(seededState.serviceWorkerReady, true, 'test must start with an active service worker registration');
        assert(seededState.registrationCount > 0, 'test must start with at least one service worker registration');

        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
            page.click('#force-cache-refresh'),
        ]);
        await page.waitForSelector('#view-home.active', { timeout: 10000 });

        const refreshedState = await page.evaluate(async expectedAssets => {
            const currentUrl = new URL(window.location.href);
            const token = currentUrl.searchParams.get('__miaosite_force_reload') || '';
            const cacheNames = await caches.keys();
            const registrations = await navigator.serviceWorker.getRegistrations();
            const resourceUrls = Array.from(document.querySelectorAll('link[rel="stylesheet"], script[src]'))
                .map(el => el.href || el.src)
                .filter(Boolean)
                .map(url => new URL(url, window.location.href));

            const assetStates = expectedAssets.map(pathname => {
                const match = resourceUrls.find(url => url.origin === window.location.origin && url.pathname === pathname);
                return {
                    pathname,
                    present: !!match,
                    token: match ? match.searchParams.get('__miaosite_force_reload') || '' : '',
                    url: match ? match.pathname + match.search + match.hash : '',
                };
            });

            return {
                token,
                consumedSessionToken: sessionStorage.getItem('miaosite_force_reload_token'),
                activeToken: window.__miaositeForceReloadToken || '',
                cacheNames,
                registrations: registrations.map(registration => registration.scope),
                controllerScript: navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL,
                assetStates,
            };
        }, EXPECTED_BUSTED_ASSETS);

        assert(refreshedState.token, 'forced refresh must reload the page with a __miaosite_force_reload token');
        assert.strictEqual(
            refreshedState.activeToken,
            refreshedState.token,
            'the next page load must expose the same token for asset cache-busting'
        );
        assert.strictEqual(
            refreshedState.consumedSessionToken,
            null,
            'one-time session token must be consumed after the forced reload'
        );
        assert(
            !refreshedState.cacheNames.includes('miaosite-test-stale-cache'),
            'titlebar cache refresh must delete stale Cache Storage entries'
        );
        assert.deepStrictEqual(
            refreshedState.cacheNames.filter(name => name.startsWith('miaosite-')),
            [],
            'forced refresh load must not immediately rebuild miaosite service-worker caches'
        );
        assert.deepStrictEqual(
            refreshedState.registrations,
            [],
            'forced refresh load must leave service workers unregistered for this one reload'
        );
        assert.strictEqual(
            refreshedState.controllerScript,
            null,
            'forced refresh load must not still be controlled by the old service worker'
        );

        const missingAssets = refreshedState.assetStates.filter(asset => !asset.present);
        assert.deepStrictEqual(missingAssets, [], `expected cache-busted assets missing: ${JSON.stringify(missingAssets)}`);

        const unbustedAssets = refreshedState.assetStates.filter(asset => asset.token !== refreshedState.token);
        assert.deepStrictEqual(
            unbustedAssets,
            [],
            `all same-origin titlebar refresh assets must carry the forced refresh token: ${JSON.stringify(unbustedAssets)}`
        );

        console.log('Titlebar cache refresh check passed');
    } finally {
        await browser.close();
    }
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
