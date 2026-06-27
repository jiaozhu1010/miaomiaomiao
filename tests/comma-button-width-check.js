const assert = require('assert');
const puppeteer = require('puppeteer');

const BASE_URL = process.env.MIAOSITE_TEST_URL || 'http://localhost:3000/';

async function run() {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
        const page = await browser.newPage();
        await page.setBypassServiceWorker(true);
        await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
        await page.goto(`${BASE_URL}?comma_button_width_check=1`, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForSelector('#comma-copy-btn', { timeout: 10000 });

        const state = await page.evaluate(() => {
            const main = document.getElementById('comma-copy-btn');
            const arrow = document.getElementById('comma-arrow-btn');
            const group = document.getElementById('comma-split-group');
            const mainStyle = getComputedStyle(main);
            const arrowStyle = getComputedStyle(arrow);
            return {
                mainWidth: Math.round(main.getBoundingClientRect().width),
                arrowWidth: Math.round(arrow.getBoundingClientRect().width),
                groupWidth: Math.round(group.getBoundingClientRect().width),
                mainPaddingLeft: mainStyle.paddingLeft,
                mainPaddingRight: mainStyle.paddingRight,
                arrowPaddingLeft: arrowStyle.paddingLeft,
                arrowPaddingRight: arrowStyle.paddingRight,
                text: main.textContent.trim(),
            };
        });

        assert.strictEqual(state.text, '逗号拼接', 'comma button label must stay unchanged');
        assert.strictEqual(state.mainPaddingLeft, '10px', 'comma main button should use compact fixed-width padding');
        assert.strictEqual(state.mainPaddingRight, '10px', 'comma main button should use compact fixed-width padding');
        assert.strictEqual(state.arrowPaddingLeft, '10px', 'split arrow button padding should stay unchanged');
        assert.strictEqual(state.arrowPaddingRight, '10px', 'split arrow button padding should stay unchanged');
        assert(state.mainWidth >= 90 && state.mainWidth <= 92, `comma main button should fit both labels without excess width, got ${state.mainWidth}px`);
        assert(state.groupWidth >= 120 && state.groupWidth <= 123, `comma split group should align dropdown while staying compact, got ${state.groupWidth}px`);

        await page.click('#comma-arrow-btn');
        await page.waitForSelector('#comma-popup.open', { timeout: 5000 });
        await new Promise(resolve => setTimeout(resolve, 320));

        const dropdownState = await page.evaluate(() => {
            function metrics(el) {
                const rect = el.getBoundingClientRect();
                return {
                    text: el.textContent.trim().replace(/\s+/g, ' '),
                    rawText: el.textContent.trim(),
                    html: el.innerHTML,
                    whiteSpace: getComputedStyle(el).whiteSpace,
                    width: Math.round(rect.width),
                    layoutWidth: el.offsetWidth,
                    clientWidth: el.clientWidth,
                    scrollWidth: el.scrollWidth,
                    clientHeight: el.clientHeight,
                    scrollHeight: el.scrollHeight,
                };
            }

            return {
                popup: metrics(document.getElementById('comma-popup')),
                items: Array.from(document.querySelectorAll('.comma-popup-item')).map(metrics),
                hints: Array.from(document.querySelectorAll('.comma-popup-hint')).map(metrics),
            };
        });

        assert(
            Math.abs(dropdownState.popup.layoutWidth - state.groupWidth) <= 1,
            `comma dropdown width must align with split button width, got popup ${dropdownState.popup.layoutWidth}px and group ${state.groupWidth}px`
        );
        assert.deepStrictEqual(
            dropdownState.items.filter(item => item.scrollWidth > item.clientWidth + 1),
            [],
            `comma dropdown items must not overflow horizontally: ${JSON.stringify(dropdownState.items)}`
        );
        assert.deepStrictEqual(
            dropdownState.hints.filter(hint => hint.scrollWidth > hint.clientWidth + 1),
            [],
            `comma dropdown hints must not overflow horizontally: ${JSON.stringify(dropdownState.hints)}`
        );
        assert.deepStrictEqual(
            dropdownState.hints.map(hint => hint.text),
            ['DPK...，DPK...', 'DPK...，↵ DPK...，'],
            'comma dropdown helper text should preview the joined output style'
        );
        assert(
            dropdownState.hints[1].rawText.includes('\n'),
            `newline helper preview should include a visible line break: ${JSON.stringify(dropdownState.hints[1])}`
        );
        assert(
            dropdownState.hints[1].text.includes('↵'),
            `newline helper preview should include an enter marker: ${JSON.stringify(dropdownState.hints[1])}`
        );
        assert.strictEqual(
            dropdownState.hints[1].whiteSpace,
            'pre-line',
            'newline helper preview should preserve its result-style line break'
        );

        await page.click('.comma-popup-item[data-format="newline"]');
        await new Promise(resolve => setTimeout(resolve, 260));

        const newlineState = await page.evaluate(() => {
            const main = document.getElementById('comma-copy-btn');
            return {
                text: main.textContent.trim(),
                width: Math.round(main.getBoundingClientRect().width),
                clientWidth: main.clientWidth,
                scrollWidth: main.scrollWidth,
            };
        });

        assert.strictEqual(newlineState.text, '逗号+换行', 'newline mode should keep the requested button label');
        assert(
            newlineState.width >= 90 && newlineState.width <= 92,
            `newline mode button should remain the same compact width, got ${newlineState.width}px`
        );
        assert(
            newlineState.scrollWidth <= newlineState.clientWidth + 1,
            `newline mode label must not overflow: ${JSON.stringify(newlineState)}`
        );

        console.log('Comma button width check passed');
    } finally {
        await browser.close();
    }
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
