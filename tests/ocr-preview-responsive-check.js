const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer');

const BASE_URL = process.env.MIAOSITE_TEST_URL || 'http://localhost:3000/';
const PNG_1X1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lF2p8QAAAABJRU5ErkJggg==',
    'base64'
);

async function preparePage(page, imagePath) {
    await page.setRequestInterception(true);
    page.on('request', request => {
        const url = request.url();
        if (url.includes('/api/barcode-decode')) {
            request.respond({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ codes: ['DPK123456789012'] })
            });
            return;
        }
        if (url.includes('/api/ocr')) {
            request.respond({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ text: 'DPK123456789012' })
            });
            return;
        }
        request.continue();
    });
    await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector('#view-home.active', { timeout: 10000 });
    const fileInput = await page.$('#ocr-file-input');
    await fileInput.uploadFile(imagePath);
    await page.waitForFunction(
        () => document.getElementById('ocr-status').textContent.includes('已填入文本框'),
        { timeout: 10000 }
    );
    await page.evaluate(() => window.__openOcrLightboxForTest && window.__openOcrLightboxForTest());
    await page.waitForSelector('#lightbox-overlay.active', { timeout: 5000 });
}

async function inspectViewport(viewport, imagePath) {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    try {
        const page = await browser.newPage();
        await page.setViewport(viewport);
        await preparePage(page, imagePath);
        const state = await page.evaluate(() => {
            const panel = document.querySelector('.lightbox-panel').getBoundingClientRect();
            const toolbar = document.querySelector('.lightbox-toolbar').getBoundingClientRect();
            const body = document.querySelector('.lightbox-body').getBoundingClientRect();
            const side = document.querySelector('.lightbox-side').getBoundingClientRect();
            const wrap = document.getElementById('lightbox-wrap').getBoundingClientRect();
            const buttons = Array.from(document.querySelectorAll('.lightbox-toolbar button')).map(btn => btn.getBoundingClientRect());
            const overflowingButtons = buttons.filter(rect => rect.width <= 0 || rect.height <= 0).length;
            return {
                panelLeft: panel.left,
                panelRight: panel.right,
                panelBottom: panel.bottom,
                toolbarWidth: toolbar.width,
                bodyWidth: body.width,
                sideTop: Math.round(side.top),
                wrapBottom: Math.round(wrap.bottom),
                sideLeft: Math.round(side.left),
                wrapLeft: Math.round(wrap.left),
                overflowingButtons
            };
        });
        return state;
    } finally {
        await browser.close();
    }
}

async function run() {
    const imagePath = path.join(os.tmpdir(), `miaosite-ocr-responsive-${Date.now()}.png`);
    fs.writeFileSync(imagePath, PNG_1X1);
    try {
        const desktop = await inspectViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 }, imagePath);
        assert(desktop.panelLeft >= 0 && desktop.panelRight <= 1440, 'desktop lightbox panel must stay inside viewport');
        assert(desktop.panelBottom <= 1000, `desktop lightbox panel must not overflow viewport height: ${JSON.stringify(desktop)}`);
        assert(desktop.sideLeft > desktop.wrapLeft, 'desktop lightbox side panel should sit beside image');
        assert.strictEqual(desktop.overflowingButtons, 0, 'desktop toolbar buttons must render with stable dimensions');

        const mobile = await inspectViewport({ width: 390, height: 844, deviceScaleFactor: 2 }, imagePath);
        assert(mobile.panelLeft >= 0 && mobile.panelRight <= 390, 'mobile lightbox panel must stay inside viewport');
        assert(mobile.panelBottom <= 844, 'mobile lightbox panel must not overflow viewport height');
        assert(mobile.sideTop >= mobile.wrapBottom, 'mobile lightbox side panel should stack below image');
        assert(mobile.toolbarWidth <= mobile.bodyWidth, 'mobile toolbar should fit within panel width');
        assert.strictEqual(mobile.overflowingButtons, 0, 'mobile toolbar buttons must render with stable dimensions');
    } finally {
        fs.rmSync(imagePath, { force: true });
    }
}

run().then(() => {
    console.log('OCR preview responsive check passed');
}).catch(error => {
    console.error(error);
    process.exit(1);
});
