const assert = require('assert');
const puppeteer = require('puppeteer');

const BASE_URL = process.env.MIAOSITE_TEST_URL || 'http://localhost:3000/';

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setBypassServiceWorker(true);
        await page.setViewport({ width: 1440, height: 720, deviceScaleFactor: 1 });
        await page.goto(`${BASE_URL}?back_to_top_animation_check=${Date.now()}`, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });
        await page.waitForSelector('#view-home.active', { timeout: 10000 });

        const initialState = await page.evaluate(() => {
            const wrap = document.getElementById('back-to-top-wrap');
            return {
                visible: wrap.classList.contains('visible'),
                progress: wrap.style.getPropertyValue('--scroll-progress'),
                ariaHidden: wrap.getAttribute('aria-hidden')
            };
        });
        assert.strictEqual(initialState.visible, false, 'back-to-top button must start hidden before scrolling');
        assert.strictEqual(initialState.ariaHidden, 'true', 'hidden back-to-top button must be hidden from assistive tech');

        await page.evaluate(() => {
            window.scrollTo(0, Math.floor(window.innerHeight * 0.5) - 20);
        });
        await delay(180);
        const beforeHalfPageState = await page.evaluate(() => {
            const wrap = document.getElementById('back-to-top-wrap');
            return {
                scrollY: window.scrollY,
                viewportHeight: window.innerHeight,
                visible: wrap.classList.contains('visible'),
                ariaHidden: wrap.getAttribute('aria-hidden')
            };
        });
        assert(
            beforeHalfPageState.scrollY < beforeHalfPageState.viewportHeight * 0.5,
            'test page must be just before the half-page reveal threshold'
        );
        assert.strictEqual(beforeHalfPageState.visible, false, 'back-to-top button must stay hidden before half a page is scrolled');
        assert.strictEqual(beforeHalfPageState.ariaHidden, 'true', 'pre-threshold back-to-top button must stay hidden from assistive tech');

        await page.evaluate(() => {
            window.scrollTo(0, Math.ceil(window.innerHeight * 0.5) + 20);
        });
        await page.waitForFunction(() => {
            const wrap = document.getElementById('back-to-top-wrap');
            return window.scrollY >= window.innerHeight * 0.5 && wrap && wrap.classList.contains('visible');
        }, { timeout: 5000 });

        const scrolledState = await page.evaluate(() => {
            const wrap = document.getElementById('back-to-top-wrap');
            const btn = document.getElementById('back-to-top');
            const trail = btn.querySelector('.back-to-top-trail');
            const flame = btn.querySelector('.back-to-top-flame');
            const halo = wrap.querySelector('.back-to-top-halo');
            const ring = document.getElementById('ring-fill');
            const wrapStyle = getComputedStyle(wrap);
            const btnStyle = getComputedStyle(btn);
            return {
                scrollY: window.scrollY,
                viewportHeight: window.innerHeight,
                visible: wrap.classList.contains('visible'),
                ready: wrap.classList.contains('is-ready'),
                progressValue: parseFloat(wrap.style.getPropertyValue('--scroll-progress')),
                title: btn.getAttribute('title'),
                ariaLabel: btn.getAttribute('aria-label'),
                ariaHidden: wrap.getAttribute('aria-hidden'),
                hasTrail: !!trail,
                hasFlame: !!flame,
                hasHalo: !!halo,
                ringOffset: parseFloat(ring.style.strokeDashoffset),
                wrapTransition: wrapStyle.transitionProperty,
                btnAnimation: btnStyle.animationName,
                btnBoxShadow: btnStyle.boxShadow,
                bottom: Math.round(wrap.getBoundingClientRect().bottom),
                right: Math.round(wrap.getBoundingClientRect().right)
            };
        });

        assert(scrolledState.scrollY >= scrolledState.viewportHeight * 0.5, 'test page must be at least half a viewport down before checking the animation');
        assert.strictEqual(scrolledState.visible, true, 'back-to-top button must become visible after scrolling');
        assert.strictEqual(scrolledState.ready, true, 'visible back-to-top button must enter its enhanced ready state');
        assert(scrolledState.progressValue > 0 && scrolledState.progressValue < 1, 'scroll progress CSS variable must be updated');
        assert.strictEqual(scrolledState.title, '回到顶部喵~', 'button title should stay friendly and unchanged');
        assert.strictEqual(scrolledState.ariaLabel, '回到顶部', 'button must expose a clean accessible label');
        assert.strictEqual(scrolledState.ariaHidden, 'false', 'visible back-to-top button must be exposed to assistive tech');
        assert.strictEqual(scrolledState.hasTrail, true, 'enhanced button must include a rocket trail layer');
        assert.strictEqual(scrolledState.hasFlame, true, 'enhanced button must include a flame layer');
        assert.strictEqual(scrolledState.hasHalo, true, 'enhanced button must include a halo layer');
        assert(scrolledState.ringOffset >= 0 && scrolledState.ringOffset < 157.08, 'progress ring must reflect scroll depth');
        assert(/transform|opacity|filter/.test(scrolledState.wrapTransition), 'wrap transition must animate visibility smoothly');
        assert.notStrictEqual(scrolledState.btnAnimation, 'none', 'visible rocket button must have a subtle idle animation');
        assert(!/rgba\(0,\s*0,\s*0,\s*0\)/.test(scrolledState.btnBoxShadow), 'button must have a visible polished shadow');
        assert(scrolledState.bottom <= scrolledState.viewportHeight && scrolledState.right <= 1440, 'button must stay inside viewport');

        await page.click('#back-to-top');
        await delay(120);
        const launchState = await page.evaluate(() => {
            const wrap = document.getElementById('back-to-top-wrap');
            return {
                launching: wrap.classList.contains('launching'),
                launchClouds: document.querySelectorAll('.launch-cloud').length,
                launchSparks: document.querySelectorAll('.launch-spark').length,
                launchRocket: !!document.querySelector('.launch-rocket')
            };
        });

        assert.strictEqual(launchState.launching, true, 'clicking back-to-top must enter a launch animation state');
        assert(launchState.launchClouds >= 3, 'launch animation must create soft cloud puffs');
        assert(launchState.launchSparks >= 6, 'launch animation must create spark particles');
        assert.strictEqual(launchState.launchRocket, true, 'launch animation must create a flying rocket');

        await page.waitForFunction(() => window.scrollY < 30, { timeout: 5000 });
        await delay(1000);
        const finishedState = await page.evaluate(() => ({
            scrollY: window.scrollY,
            launching: document.getElementById('back-to-top-wrap').classList.contains('launching'),
            visible: document.getElementById('back-to-top-wrap').classList.contains('visible'),
            remainingParticles: document.querySelectorAll('.launch-cloud, .launch-spark, .launch-rocket').length
        }));

        assert(finishedState.scrollY < 30, 'back-to-top click must scroll the page to the top');
        assert.strictEqual(finishedState.launching, false, 'launching class must be removed after animation');
        assert.strictEqual(finishedState.visible, false, 'button must hide again at the top');
        assert.strictEqual(finishedState.remainingParticles, 0, 'launch particles must clean themselves up');

        console.log('Back-to-top animation check passed');
    } finally {
        await browser.close();
    }
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
