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

async function run() {
    const tempImagePath = path.join(os.tmpdir(), `miaosite-ocr-preview-${Date.now()}.png`);
    fs.writeFileSync(tempImagePath, PNG_1X1);

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
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

        await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
        await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForSelector('#view-home.active', { timeout: 10000 });

        const browserTitle = await page.title();
        assert.strictEqual(browserTitle, '喵码生成器', 'browser tab title should be exactly 喵码生成器');

        const pageNavTitle = await page.$eval('#nav-title', el => el.textContent.trim());
        assert.strictEqual(pageNavTitle, '喵码生成器', 'page nav title should remain the simple in-page brand label');

        const fileInput = await page.$('#ocr-file-input');
        await fileInput.uploadFile(tempImagePath);
        await page.waitForFunction(
            () => !document.getElementById('ocr-preview').hidden
                && document.getElementById('ocr-preview-wrap')
                && !document.getElementById('ocr-preview-wrap').hidden,
            { timeout: 10000 }
        );
        await page.waitForFunction(
            () => document.getElementById('ocr-status').textContent.includes('已填入文本框'),
            { timeout: 10000 }
        );

        const previewState = await page.evaluate(() => ({
            previewWrapHidden: document.getElementById('ocr-preview-wrap').hidden,
            previewButtonExists: !!document.getElementById('ocr-preview-button'),
            previewMeta: document.getElementById('ocr-preview-meta')?.textContent || '',
            previewCta: document.querySelector('.ocr-preview-zoom')?.textContent || ''
        }));
        assert.strictEqual(previewState.previewWrapHidden, false, 'OCR preview wrap should become visible after upload');
        assert.strictEqual(previewState.previewButtonExists, true, 'OCR preview image should be a clear preview button');
        assert(previewState.previewMeta.includes('miaosite-ocr-preview'), 'OCR preview metadata should show the uploaded filename');
        assert(previewState.previewCta.includes('查看大图'), 'OCR preview should expose a clear large-preview action');

        await page.click('#ocr-preview-button');
        await page.waitForSelector('#lightbox-overlay.active', { timeout: 5000 });

        const lightboxState = await page.evaluate(() => ({
            role: document.getElementById('lightbox-overlay').getAttribute('role'),
            modal: document.getElementById('lightbox-overlay').getAttribute('aria-modal'),
            toolbarButtons: Array.from(document.querySelectorAll('.lightbox-tool-btn')).map(btn => btn.getAttribute('aria-label')),
            zoomText: document.getElementById('lightbox-zoom-value')?.textContent || '',
            filename: document.getElementById('lightbox-filename')?.textContent || '',
            dimensions: document.getElementById('lightbox-dimensions')?.textContent || '',
            codes: document.getElementById('lightbox-code-list')?.textContent || '',
            imageTransform: document.getElementById('lightbox-img').style.transform,
            copyButtonExists: !!document.getElementById('lightbox-copy-codes'),
            fillCodeButtons: document.querySelectorAll('.lightbox-code-list button').length,
            backdropBackground: getComputedStyle(document.querySelector('.lightbox-backdrop')).backgroundColor
        }));

        assert.strictEqual(lightboxState.role, 'dialog', 'lightbox should expose a dialog role');
        assert.strictEqual(lightboxState.modal, 'true', 'lightbox should be modal for assistive tech');
        ['缩小', '放大', '适应窗口', '原始大小', '向左旋转', '向右旋转'].forEach(label => {
            assert(lightboxState.toolbarButtons.includes(label), `lightbox toolbar should include ${label}`);
        });
        assert.strictEqual(lightboxState.zoomText, '100%', 'lightbox should show current zoom');
        assert(lightboxState.filename.includes('miaosite-ocr-preview'), 'lightbox should show filename');
        assert(/\d+\s*[x×]\s*\d+/.test(lightboxState.dimensions), 'lightbox should show image dimensions');
        assert(lightboxState.codes.includes('DPK123456789012'), 'lightbox should show recognized tracking codes');
        assert(lightboxState.imageTransform.includes('translate3d'), 'lightbox transform should use pixel-based pan state');
        assert.strictEqual(lightboxState.copyButtonExists, false, 'lightbox should not include non-preview copy button');
        assert.strictEqual(lightboxState.fillCodeButtons, 0, 'recognized codes should not be clickable fill buttons inside preview lightbox');
        assert(/rgba\([^,]+,[^,]+,[^,]+,\s*0\.[0-5]/.test(lightboxState.backdropBackground), 'lightbox backdrop should keep the website visible behind it');

        await page.click('#lightbox-zoom-in');
        await page.click('#lightbox-rotate-right');
        const changedTransform = await page.$eval('#lightbox-img', el => el.style.transform);
        assert(changedTransform.includes('scale(1.25)'), 'zoom-in control should increase image scale');
        assert(changedTransform.includes('rotate(90deg)'), 'rotate control should rotate the preview image');
    } finally {
        await browser.close();
        fs.rmSync(tempImagePath, { force: true });
    }
}

run().then(() => {
    console.log('OCR preview lightbox check passed');
}).catch(error => {
    console.error(error);
    process.exit(1);
});
