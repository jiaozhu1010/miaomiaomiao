const assert = require('assert');
const puppeteer = require('puppeteer');

const BASE_URL = process.env.MIAOSITE_TEST_URL || 'http://localhost:3000/';

function parseCssColor(color) {
    const match = color.match(/rgba?\(([^)]+)\)/);
    if (!match) return null;
    const parts = match[1].split(',').map(part => Number(part.trim()));
    return {
        r: parts[0],
        g: parts[1],
        b: parts[2],
        a: parts.length > 3 ? parts[3] : 1
    };
}

function parseCssDuration(duration) {
    if (duration.endsWith('ms')) return Number(duration.slice(0, -2));
    if (duration.endsWith('s')) return Number(duration.slice(0, -1)) * 1000;
    return Number(duration);
}

async function run() {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setBypassServiceWorker(true);
        await page.setCacheEnabled(false);
        await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
        const separator = BASE_URL.indexOf('?') === -1 ? '?' : '&';
        await page.goto(
            BASE_URL + separator + '__miaosite_force_reload=data_tools_style_check_' + Date.now(),
            { waitUntil: 'networkidle2', timeout: 30000 }
        );
        await page.waitForSelector('#view-home.active .data-tools-card', { timeout: 10000 });

        await page.focus('#data-tools-input');
        await new Promise(resolve => setTimeout(resolve, 800));

        const styleState = await page.evaluate(() => {
            const input = document.getElementById('data-tools-input');
            const card = document.querySelector('#view-home .data-tools-card');
            const output = document.getElementById('data-tools-output');
            const indicator = document.getElementById('data-tools-tabs-indicator');
            const tab = document.querySelector('#view-home .data-tools-tab.active');
            const empty = document.querySelector('#view-home .data-tools-empty');
            const inputStyle = getComputedStyle(input);
            const cardStyle = getComputedStyle(card);
            const outputStyle = getComputedStyle(output);
            const indicatorStyle = getComputedStyle(indicator);
            const tabStyle = getComputedStyle(tab);
            const emptyStyle = getComputedStyle(empty);

            return {
                activeId: document.activeElement && document.activeElement.id,
                cardFocused: card.classList.contains('is-focused'),
                cardTransform: cardStyle.transform,
                cardTransition: cardStyle.transitionProperty,
                inputBorderTopColor: inputStyle.borderTopColor,
                inputOutlineStyle: inputStyle.outlineStyle,
                inputBoxShadow: inputStyle.boxShadow,
                inputTransition: inputStyle.transitionProperty,
                cardOverflowY: cardStyle.overflowY,
                cardScrollbarWidth: cardStyle.scrollbarWidth || '',
                outputOverflowX: outputStyle.overflowX,
                outputOverflowY: outputStyle.overflowY,
                outputScrollbarWidth: outputStyle.scrollbarWidth || '',
                indicatorTransition: indicatorStyle.transitionProperty,
                indicatorHasTransform: indicatorStyle.transform !== 'none',
                activeTabTransform: tabStyle.transform,
                emptyAnimationName: emptyStyle.animationName
            };
        });

        assert.strictEqual(styleState.activeId, 'data-tools-input', 'data tools textarea should be focusable');
        assert.strictEqual(styleState.cardFocused, true, 'data tools card should receive an is-focused state when the textarea is active');
        assert.notStrictEqual(styleState.cardTransform, 'none', 'focused data tools card should lift subtly');
        assert(/transform/.test(styleState.cardTransition), 'data tools card should transition transform for interaction feedback');
        const borderColor = parseCssColor(styleState.inputBorderTopColor);
        assert(borderColor, 'focused data tools textarea should expose a computed border color');
        assert(
            borderColor.r >= 250 && borderColor.g >= 150 && borderColor.g <= 165
                && borderColor.b >= 60 && borderColor.b <= 75 && borderColor.a >= 0.9,
            'focused data tools textarea should keep one orange border'
        );
        assert.strictEqual(
            styleState.inputOutlineStyle,
            'none',
            'focused data tools textarea should suppress the global focus outline'
        );
        assert.strictEqual(
            styleState.inputBoxShadow,
            'none',
            'focused data tools textarea should not add a second orange outline through box-shadow'
        );
        assert(/background-color|border/.test(styleState.inputTransition), 'data tools textarea should animate focus color changes');
        assert.notStrictEqual(
            styleState.cardOverflowY,
            'scroll',
            'data tools card should not force a visible vertical scrollbar'
        );
        assert.strictEqual(
            styleState.cardScrollbarWidth,
            'none',
            'data tools card should hide its vertical scrollbar track'
        );
        assert.strictEqual(
            styleState.outputOverflowX,
            'auto',
            'data tools table output should still allow horizontal scrolling for wide tables'
        );
        assert.strictEqual(
            styleState.outputOverflowY,
            'auto',
            'data tools output should keep content scroll behavior when results are long'
        );
        assert.strictEqual(
            styleState.outputScrollbarWidth,
            'none',
            'data tools output should hide the right-side scrollbar while preserving scrollability'
        );
        assert(/transform|width/.test(styleState.indicatorTransition), 'data tools tab indicator should animate between tabs');
        assert.strictEqual(styleState.indicatorHasTransform, true, 'data tools tab indicator should be positioned with transform for smooth movement');
        assert.notStrictEqual(styleState.activeTabTransform, 'none', 'active data tools tab should have a subtle pressed/lifted state');
        assert.strictEqual(styleState.emptyAnimationName, 'dataToolsResultIn', 'data tools empty/result state should animate into view');

        await page.click('#view-home .data-tools-tab[data-tab="image"]');
        await page.waitForFunction(
            () => document.getElementById('panel-image').classList.contains('active')
                && document.querySelector('#view-home .data-tools-tab[data-tab="image"]').classList.contains('active'),
            { timeout: 3000 }
        );
        const switchState = await page.evaluate(() => {
            const textPanel = document.getElementById('panel-text');
            const imagePanel = document.getElementById('panel-image');
            const imageStyle = getComputedStyle(imagePanel);
            return {
                currentTab: document.querySelector('#view-home .data-tools-tab.active').dataset.tab,
                textActive: textPanel.classList.contains('active'),
                imageActive: imagePanel.classList.contains('active'),
                imageAnimation: imageStyle.animationName
            };
        });
        assert.strictEqual(switchState.currentTab, 'image', 'clicking image tab should activate image mode');
        assert.strictEqual(switchState.textActive, false, 'text panel should deactivate after image tab switch');
        assert.strictEqual(switchState.imageActive, true, 'image panel should activate after image tab switch');
        assert.strictEqual(switchState.imageAnimation, 'dataToolsPanelIn', 'data tools panel should animate in when switching tabs');

        await page.evaluate(() => {
            window.__dataToolsAnimateResultForTest && window.__dataToolsAnimateResultForTest('loading');
        });
        await page.waitForFunction(
            () => document.querySelector('#view-home .data-tools-card').classList.contains('is-processing')
                && document.getElementById('data-tools-output').classList.contains('is-updating'),
            { timeout: 3000 }
        );
        const processingState = await page.evaluate(() => ({
            cardProcessing: document.querySelector('#view-home .data-tools-card').classList.contains('is-processing'),
            outputUpdating: document.getElementById('data-tools-output').classList.contains('is-updating')
        }));
        assert.strictEqual(processingState.cardProcessing, true, 'loading state should mark data tools card as processing');
        assert.strictEqual(processingState.outputUpdating, true, 'loading state should mark output as updating');

        await page.evaluate(() => {
            window.__dataToolsAnimateResultForTest && window.__dataToolsAnimateResultForTest('success');
        });
        await page.waitForFunction(
            () => !document.querySelector('#view-home .data-tools-card').classList.contains('is-processing')
                && document.querySelector('#view-home .data-tools-card').classList.contains('is-complete'),
            { timeout: 3000 }
        );
        const completeState = await page.evaluate(() => ({
            cardProcessing: document.querySelector('#view-home .data-tools-card').classList.contains('is-processing'),
            cardComplete: document.querySelector('#view-home .data-tools-card').classList.contains('is-complete'),
            outputUpdating: document.getElementById('data-tools-output').classList.contains('is-updating')
        }));
        assert.strictEqual(completeState.cardProcessing, false, 'success state should clear processing state');
        assert.strictEqual(completeState.cardComplete, true, 'success state should briefly mark card as complete');
        assert.strictEqual(completeState.outputUpdating, false, 'success state should clear output updating state');

        await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
        await page.reload({ waitUntil: 'networkidle2' });
        await page.waitForSelector('#view-home.active .data-tools-card', { timeout: 10000 });
        const reducedMotionState = await page.evaluate(() => {
            const card = document.querySelector('#view-home .data-tools-card');
            const panel = document.getElementById('panel-text');
            const empty = document.querySelector('#view-home .data-tools-empty');
            return {
                cardAnimationDuration: getComputedStyle(card).animationDuration,
                panelAnimationDuration: getComputedStyle(panel).animationDuration,
                emptyAnimationDuration: getComputedStyle(empty).animationDuration
            };
        });
        assert(parseCssDuration(reducedMotionState.cardAnimationDuration) <= 0.01, 'reduced motion should disable data tools card animation');
        assert(parseCssDuration(reducedMotionState.panelAnimationDuration) <= 0.01, 'reduced motion should disable data tools panel animation');
        assert(parseCssDuration(reducedMotionState.emptyAnimationDuration) <= 0.01, 'reduced motion should disable data tools output animation');
    } finally {
        await browser.close();
    }
}

run().then(() => {
    console.log('Data tools card style check passed');
}).catch(error => {
    console.error(error);
    process.exit(1);
});
