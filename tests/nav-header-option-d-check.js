const assert = require('assert');
const puppeteer = require('puppeteer');

const BASE_URL = process.env.MIAOSITE_TEST_URL || 'http://localhost:3000/';

function overlaps(a, b) {
    if (!a || !b) return false;
    const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return x > 0 && y > 0;
}

async function readNavState(page) {
    return page.evaluate(() => {
        function box(selector) {
            const el = document.querySelector(selector);
            if (!el) return null;
            const rect = el.getBoundingClientRect();
            return {
                left: Math.round(rect.left),
                right: Math.round(rect.right),
                top: Math.round(rect.top),
                bottom: Math.round(rect.bottom),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
            };
        }

        const nav = document.querySelector('.nav-bar');
        const modules = Array.from(document.querySelectorAll('.nav-module'));
        const oldIds = ['nav-title', 'nav-subtitle', 'online-badge', 'force-cache-refresh', 'btn-user'];
        const missingIds = oldIds.filter(id => !document.getElementById(id));
        const tabs = Array.from(document.querySelectorAll('.nav-pill-tab[data-view]'));
        const textOverflow = Array.from(document.querySelectorAll(
            '.nav-title, .nav-subtitle, .nav-pill-tab, .online-badge, .nav-btn'
        )).filter(el => getComputedStyle(el).display !== 'none')
            .filter(el => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
            .map(el => ({
            className: el.className,
            text: el.textContent.trim(),
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
        }));

        return {
            nav: box('.nav-bar'),
            brand: box('.nav-brand-module'),
            menu: box('.nav-menu-module'),
            ops: box('.nav-ops-module'),
            modules: modules.map(el => Array.from(el.classList)),
            moduleVisuals: modules.map(el => {
                const style = getComputedStyle(el);
                return {
                    backgroundColor: style.backgroundColor,
                    borderTopWidth: style.borderTopWidth,
                    boxShadow: style.boxShadow,
                };
            }),
            activeTab: document.querySelector('.nav-pill-tab.active')?.dataset.view || '',
            tabViews: tabs.map(tab => tab.dataset.view),
            missingIds,
            hasAdminEntry: !!document.getElementById('admin-entry'),
            textOverflow,
            display: nav ? getComputedStyle(nav).display : '',
            gridColumns: nav ? getComputedStyle(nav).gridTemplateColumns : '',
            bodyView: document.body.dataset.activeView,
        };
    });
}

async function run() {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
        const page = await browser.newPage();
        await page.setBypassServiceWorker(true);
        await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
        await page.goto(`${BASE_URL}?nav_header_option_d_check=1`, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForSelector('#view-home.active', { timeout: 10000 });
        await page.waitForSelector('.nav-bar .nav-brand-module', { timeout: 10000 });

        const initial = await readNavState(page);
        assert.strictEqual(initial.display, 'grid', 'option D header must use a three-module grid layout');
        assert.deepStrictEqual(initial.missingIds, [], 'option D must preserve existing functional IDs');
        assert.strictEqual(initial.hasAdminEntry, true, 'admin entry must remain in the title bar for manager users');
        assert.deepStrictEqual(initial.tabViews, ['knowledge', 'home', 'tools'], 'main navigation views must stay unchanged');
        assert.strictEqual(initial.activeTab, 'home', 'home tab must remain active on first load');
        assert.strictEqual(initial.modules.length, 3, 'header must be split into brand, navigation, and operations modules');
        assert(initial.modules.some(list => list.includes('nav-brand-module')), 'brand module is missing');
        assert(initial.modules.some(list => list.includes('nav-menu-module')), 'navigation module is missing');
        assert(initial.modules.some(list => list.includes('nav-ops-module')), 'operations module is missing');
        assert.deepStrictEqual(
            initial.moduleVisuals,
            [
                { backgroundColor: 'rgba(0, 0, 0, 0)', borderTopWidth: '0px', boxShadow: 'none' },
                { backgroundColor: 'rgba(0, 0, 0, 0)', borderTopWidth: '0px', boxShadow: 'none' },
                { backgroundColor: 'rgba(0, 0, 0, 0)', borderTopWidth: '0px', boxShadow: 'none' },
            ],
            'option D modules must be structural only; the title bar should read as one long card'
        );
        assert(initial.nav.width <= 1392, 'desktop header must fit inside the 1440px viewport with page padding');
        assert.strictEqual(initial.textOverflow.length, 0, `header text must not overflow: ${JSON.stringify(initial.textOverflow)}`);
        assert.strictEqual(overlaps(initial.brand, initial.menu), false, 'brand and navigation modules must not overlap');
        assert.strictEqual(overlaps(initial.menu, initial.ops), false, 'navigation and operations modules must not overlap');

        await page.click('.nav-pill-tab[data-view="tools"]');
        await page.waitForFunction(() => document.body.dataset.activeView === 'tools', { timeout: 10000 });
        const tools = await readNavState(page);
        assert.strictEqual(tools.activeTab, 'tools', 'tools tab must still activate after the header redesign');
        assert.strictEqual(tools.nav.width, initial.nav.width, 'header width must remain stable after view switches');
        assert.strictEqual(tools.textOverflow.length, 0, `header text must not overflow after switching: ${JSON.stringify(tools.textOverflow)}`);

        const beforeRefreshUrl = page.url();
        await page.click('#force-cache-refresh');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
        assert.strictEqual(
            page.url(),
            beforeRefreshUrl,
            'force refresh control must keep the browser address unchanged from the operations module'
        );
        assert(
            await page.evaluate(() => !!window.__miaositeForceReloadToken),
            'force refresh control must still apply a one-time asset refresh token from the operations module'
        );

        console.log('Nav header option D check passed');
    } finally {
        await browser.close();
    }
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
