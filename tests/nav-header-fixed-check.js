const assert = require('assert');
const puppeteer = require('puppeteer');

const BASE_URL = process.env.MIAOSITE_TEST_URL || 'http://localhost:3000/';

async function readHeaderState(page) {
    return page.evaluate(() => {
        const shell = document.querySelector('.app-shell');
        const nav = document.querySelector('.nav-bar');
        const title = document.getElementById('nav-title');
        const subtitle = document.getElementById('nav-subtitle');
        const activeView = document.body.dataset.activeView;
        return {
            activeView,
            shellWidth: Math.round(shell.getBoundingClientRect().width),
            navWidth: Math.round(nav.getBoundingClientRect().width),
            navLeft: Math.round(nav.getBoundingClientRect().left),
            titleText: title.textContent,
            subtitleText: subtitle.textContent
        };
    });
}

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

        const homeHeader = await readHeaderState(page);
        assert.strictEqual(homeHeader.activeView, 'home');
        assert.strictEqual(homeHeader.titleText, '喵码生成器', 'home title text is the fixed header baseline');
        assert.strictEqual(homeHeader.subtitleText, '🏠 miaojiaozhu.com　💬 京me群 10229406786', 'home subtitle text is the fixed header baseline');

        for (const view of ['knowledge', 'tools', 'home']) {
            await page.click(`.nav-pill-tab[data-view="${view}"]`);
            await page.waitForFunction(
                expected => document.body.dataset.activeView === expected,
                { timeout: 10000 },
                view
            );

            const state = await readHeaderState(page);
            assert.strictEqual(state.titleText, homeHeader.titleText, `${view} switch must not change title text`);
            assert.strictEqual(state.subtitleText, homeHeader.subtitleText, `${view} switch must not change subtitle text`);
            assert.strictEqual(state.navWidth, homeHeader.navWidth, `${view} switch must keep header width fixed to home baseline`);
            assert.strictEqual(state.navLeft, homeHeader.navLeft, `${view} switch must keep header horizontal position fixed`);
            if (view !== 'home') {
                assert.notStrictEqual(
                    state.shellWidth,
                    homeHeader.shellWidth,
                    `${view} content shell may keep its own existing width while header stays fixed`
                );
            }
        }
    } finally {
        await browser.close();
    }
}

run().then(() => {
    console.log('Nav header fixed check passed');
}).catch(error => {
    console.error(error);
    process.exit(1);
});
