const assert = require('assert');
const puppeteer = require('puppeteer');

const BASE_URL = process.env.MIAOSITE_TEST_URL || 'http://localhost:3000/';

function withTimeout(promise, ms, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
    ]);
}

async function run() {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
        const page = await browser.newPage();
        await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });

        const swState = await withTimeout(page.evaluate(async () => {
            if (!('serviceWorker' in navigator) || !('caches' in window)) {
                return { supported: false };
            }

            const registration = await Promise.race([
                navigator.serviceWorker.ready,
                new Promise(resolve => setTimeout(() => resolve(null), 5000)),
            ]);
            if (!registration) {
                return { supported: true, ready: false, cacheNames: [], keys: [] };
            }

            await new Promise(resolve => setTimeout(resolve, 300));
            const cacheNames = await caches.keys();
            const keys = [];
            for (const name of cacheNames) {
                if (!name.startsWith('miaosite-')) continue;
                const cache = await caches.open(name);
                const requests = await cache.keys();
                keys.push(...requests.map(request => new URL(request.url).pathname));
            }

            return {
                supported: true,
                ready: true,
                scope: registration.scope,
                cacheNames,
                keys: Array.from(new Set(keys)).sort(),
            };
        }), 10000, 'service worker state check');

        assert.strictEqual(swState.supported, true, 'service worker must be supported in Chromium test runtime');
        assert.strictEqual(swState.ready, true, 'service worker must be registered and ready');
        assert(swState.cacheNames.includes('miaosite-v3'), 'service worker must create the v3 cache');
        assert(!swState.keys.includes('/server.js'), 'service worker must not cache protected server source');
        assert(!swState.keys.includes('/tools.html'), 'service worker must not cache legacy tools redirect');
        assert(!swState.keys.includes('/knowledge.html'), 'service worker must not cache legacy knowledge redirect');
        assert(swState.keys.includes('/index.html'), 'service worker must cache the SPA shell');

        await page.goto(new URL('/?sw_runtime_check=1', BASE_URL).toString(), {
            waitUntil: 'networkidle2',
            timeout: 30000,
        });
        await page.waitForSelector('#view-home.active', { timeout: 10000 });

        console.log('service worker runtime check passed');
    } finally {
        await browser.close();
    }
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
