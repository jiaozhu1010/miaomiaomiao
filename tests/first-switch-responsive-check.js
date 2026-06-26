const assert = require('assert');
const puppeteer = require('puppeteer');

const BASE_URL = process.env.MIAOSITE_TEST_URL || 'http://localhost:3000/';

async function run() {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
        await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForSelector('#view-home.active', { timeout: 10000 });

        const result = await page.evaluate(() => {
            const tab = document.querySelector('.nav-pill-tab[data-view="knowledge"]');
            if (!tab) throw new Error('knowledge nav tab must exist');

            window.ViewManager.register('knowledge', function injectedSlowInitializer() {
                window.__firstSwitchSlowInitStartedAt = performance.now();
                const end = performance.now() + 420;
                while (performance.now() < end) {}
                window.__firstSwitchSlowInitFinishedAt = performance.now();
            });

            window.__firstSwitchStartAt = performance.now();
            tab.click();
            window.__firstSwitchClickReturnedAt = performance.now();

            return {
                clickReturnMs: window.__firstSwitchClickReturnedAt - window.__firstSwitchStartAt,
                activeView: document.body.dataset.activeView,
                currentView: window.ViewManager.getCurrent(),
                knowledgeActive: document.getElementById('view-knowledge').classList.contains('active'),
                slowInitFinishedDuringClick: typeof window.__firstSwitchSlowInitFinishedAt === 'number'
            };
        });

        assert.strictEqual(result.activeView, 'knowledge', 'first switch must activate target view during the click');
        assert.strictEqual(result.currentView, 'knowledge', 'ViewManager current view must update during the click');
        assert.strictEqual(result.knowledgeActive, true, 'target panel must become active during the click');
        assert.strictEqual(result.slowInitFinishedDuringClick, false, 'slow first-time initialization must not block the click handler');
        assert(
            result.clickReturnMs < 160,
            `first switch click handler must return quickly, got ${Math.round(result.clickReturnMs)}ms`
        );

        await page.waitForFunction(
            () => typeof window.__firstSwitchSlowInitFinishedAt === 'number',
            { timeout: 5000 }
        );
    } finally {
        await browser.close();
    }
}

run().then(() => {
    console.log('First switch responsive check passed');
}).catch(error => {
    console.error(error);
    process.exit(1);
});
