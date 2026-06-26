const assert = require('assert');
const puppeteer = require('puppeteer');

const BASE_URL = process.env.MIAOSITE_TEST_URL || 'http://localhost:3000/';

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function rectsOverlap(a, b) {
    if (!a || !b || a.width <= 0 || b.width <= 0 || a.height <= 0 || b.height <= 0) return false;
    const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return x * y > 0;
}

async function run() {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        const consoleErrors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') consoleErrors.push(msg.text());
        });
        page.on('pageerror', err => consoleErrors.push(err.message));

        await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
        await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForSelector('#view-home.active', { timeout: 10000 });
        await page.waitForFunction(
            () => document.querySelectorAll('#weather-daily .weather-day-item').length > 0
                && document.querySelectorAll('#weather-hourly .weather-hour-item').length > 0,
            { timeout: 15000 }
        );

        const initialPanelState = await page.evaluate(() => ({
            bodyView: document.body.dataset.activeView,
            currentView: window.ViewManager && window.ViewManager.getCurrent(),
            activePanels: Array.from(document.querySelectorAll('.view-panel.active')).map(el => el.id),
            homeDisplay: getComputedStyle(document.getElementById('view-home')).display,
            knowledgeDisplay: getComputedStyle(document.getElementById('view-knowledge')).display,
            toolsDisplay: getComputedStyle(document.getElementById('view-tools')).display
        }));
        assert.strictEqual(initialPanelState.bodyView, 'home', 'initial body active view must stay on home');
        assert.strictEqual(initialPanelState.currentView, 'home', 'initial ViewManager current view must stay on home');
        assert.deepStrictEqual(initialPanelState.activePanels, ['view-home'], 'initially only the home panel may be active');
        assert.strictEqual(initialPanelState.homeDisplay, 'block', 'home panel must be visible on first paint');
        assert.strictEqual(initialPanelState.knowledgeDisplay, 'none', 'knowledge panel must stay hidden until activated');
        assert.strictEqual(initialPanelState.toolsDisplay, 'none', 'tools panel must stay hidden until activated');

        const weatherState = await page.evaluate(() => {
            const weather = document.getElementById('weather-card');
            const daily = document.getElementById('weather-daily');
            const hourly = document.getElementById('weather-hourly');
            const trigger = document.getElementById('weather-city-trigger');
            trigger.click();
            const input = document.getElementById('weather-city-input');
            input.value = '苏';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            const dropdown = document.getElementById('weather-city-dropdown');
            const styles = getComputedStyle(weather);
            const dropdownStyles = getComputedStyle(dropdown);
            const rect = weather.getBoundingClientRect();
            return {
                weatherWidth: Math.round(rect.width),
                weatherHeight: Math.round(rect.height),
                weatherBackground: styles.backgroundImage,
                weatherBorder: styles.borderTopColor,
                tempFontSize: getComputedStyle(document.getElementById('weather-temp')).fontSize,
                dailyCount: daily.querySelectorAll('.weather-day-item').length,
                hourlyCount: hourly.querySelectorAll('.weather-hour-item').length,
                dailyWidth: Math.round(daily.getBoundingClientRect().width),
                hourlyWidth: Math.round(hourly.getBoundingClientRect().width),
                cityOpen: document.getElementById('weather-city-wrap').classList.contains('is-open'),
                dropdownPadding: getComputedStyle(document.querySelector('.weather-city-dropdown-search')).padding,
                dropdownDisplay: dropdownStyles.display,
                selectedCity: !!dropdown.querySelector('.weather-city-option.is-selected'),
                dots: weather.querySelectorAll('.card-dot').length
            };
        });
        assert.strictEqual(weatherState.dailyCount >= 7, true, 'weather card must render daily forecast items');
        assert.strictEqual(weatherState.hourlyCount > 0, true, 'weather card must render hourly forecast items');
        assert.strictEqual(weatherState.cityOpen, true, 'weather city dropdown must open');
        assert.strictEqual(weatherState.dropdownDisplay, 'block', 'weather city dropdown must be visible when open');
        assert.strictEqual(weatherState.dropdownPadding, '10px 12px', 'weather dropdown search row must match old spacing');
        assert.strictEqual(weatherState.selectedCity, true, 'weather city list must mark current city');
        assert.strictEqual(weatherState.dots, 12, 'weather card floating dots must be created');
        assert.strictEqual(weatherState.tempFontSize, '50px', 'weather temperature font size must match old version');
        assert(weatherState.weatherWidth >= 230 && weatherState.weatherWidth <= 250, 'desktop weather card width must match old left column');
        assert(weatherState.weatherHeight >= 320, 'weather card must keep old minimum height');
        assert(weatherState.dailyWidth <= weatherState.weatherWidth, 'daily forecast strip must stay inside weather card');
        assert(weatherState.hourlyWidth <= weatherState.weatherWidth, 'hourly forecast strip must stay inside weather card');

        await page.mouse.click(10, 10);

        const toolsTabCenter = await page.evaluate(() => {
            const tab = document.querySelector('.nav-pill-tab[data-view="tools"]');
            const target = tab.getBoundingClientRect();
            return { x: target.left + target.width / 2, y: target.top + target.height / 2 };
        });
        await page.mouse.click(toolsTabCenter.x, toolsTabCenter.y);
        await page.waitForFunction(
            () => document.body.dataset.activeView === 'tools'
                && window.ViewManager
                && window.ViewManager.getCurrent() === 'tools'
                && document.querySelector('.nav-pill-tab[data-view="tools"]').classList.contains('active')
                && document.getElementById('view-tools').classList.contains('active'),
            { timeout: 10000 }
        );
        const navToolsState = await page.evaluate(() => ({
            bodyView: document.body.dataset.activeView,
            currentView: window.ViewManager.getCurrent(),
            activeTab: document.querySelector('.nav-pill-tab.active').dataset.view,
            activePanel: document.querySelector('.view-panel.active').id,
            indicatorOpacity: getComputedStyle(document.getElementById('nav-pill-indicator')).opacity,
            lampOpacity: getComputedStyle(document.getElementById('nav-pill-lamp')).opacity
        }));
        assert.strictEqual(navToolsState.bodyView, 'tools', 'AI tools nav click must set body active view to tools');
        assert.strictEqual(navToolsState.currentView, 'tools', 'AI tools nav click must update ViewManager current view');
        assert.strictEqual(navToolsState.activeTab, 'tools', 'AI tools nav click must not activate knowledge tab');
        assert.strictEqual(navToolsState.activePanel, 'view-tools', 'AI tools nav click must show tools panel');
        assert.strictEqual(navToolsState.indicatorOpacity, '1', 'nav indicator must initialize and remain visible');
        assert.strictEqual(navToolsState.lampOpacity, '1', 'nav lamp must initialize and remain visible');

        await page.click('[data-view="tools"]');
        await page.waitForFunction(
            () => document.body.dataset.activeView === 'tools'
                && document.getElementById('view-tools').classList.contains('active'),
            { timeout: 10000 }
        );
        await page.waitForFunction(
            () => getComputedStyle(document.querySelector('.bg-yellow-glow')).opacity === '0'
                && getComputedStyle(document.querySelector('.tools-bg-glow')).opacity === '0.6'
                && getComputedStyle(document.querySelector('.tools-bg-noise')).opacity === '1',
            { timeout: 3000 }
        );

        const toolsBackground = await page.evaluate(() => ({
            yellow: getComputedStyle(document.querySelector('.bg-yellow-glow')).opacity,
            toolsGlow: getComputedStyle(document.querySelector('.tools-bg-glow')).opacity,
            toolsNoise: getComputedStyle(document.querySelector('.tools-bg-noise')).opacity,
            shellWidth: Math.round(document.querySelector('.app-shell').getBoundingClientRect().width),
            gridColumns: getComputedStyle(document.querySelector('#view-tools .bento-grid')).gridTemplateColumns.split(' ').length,
            skillCardWidth: Math.round(document.querySelector('#view-tools .skill-card').getBoundingClientRect().width)
        }));
        assert.strictEqual(toolsBackground.yellow, '0', 'home warm background must be hidden in tools view');
        assert.strictEqual(toolsBackground.toolsGlow, '0.6', 'tools glow background opacity must match old tools view');
        assert.strictEqual(toolsBackground.toolsNoise, '1', 'tools noise background must be visible in tools view');
        assert.strictEqual(toolsBackground.shellWidth, 1200, 'tools app shell must use old max width');
        assert.strictEqual(toolsBackground.gridColumns, 5, 'tools Bento grid must keep old 5-column desktop layout');
        assert(toolsBackground.skillCardWidth >= 210 && toolsBackground.skillCardWidth <= 225, 'tools skill card width must match old desktop sizing');

        await page.evaluate(() => {
            document.querySelector('#view-tools .result-actions button[data-action="copy"]').click();
        });
        await delay(300);
        assert(
            !consoleErrors.some(text => /chatMessages is not defined|showToast is not defined/.test(text)),
            'tools copy button must not reference initTools local variables from inline onclick'
        );

        await page.click('[data-view="knowledge"]');
        await page.waitForFunction(
            () => document.body.dataset.activeView === 'knowledge'
                && document.getElementById('view-knowledge').classList.contains('active'),
            { timeout: 10000 }
        );
        await page.waitForSelector('#view-knowledge .article-card', { timeout: 10000 });
        await page.waitForFunction(
            () => getComputedStyle(document.querySelector('.bg-yellow-glow')).opacity === '0'
                && getComputedStyle(document.querySelector('.tools-bg-glow')).opacity === '0'
                && getComputedStyle(document.querySelector('.tools-bg-noise')).opacity === '0',
            { timeout: 3000 }
        );

        const knowledgeBackground = await page.evaluate(() => ({
            yellow: getComputedStyle(document.querySelector('.bg-yellow-glow')).opacity,
            grid: getComputedStyle(document.querySelector('.bg-grid')).opacity,
            toolsGlow: getComputedStyle(document.querySelector('.tools-bg-glow')).opacity,
            toolsNoise: getComputedStyle(document.querySelector('.tools-bg-noise')).opacity,
            shellPadding: getComputedStyle(document.querySelector('.app-shell')).padding,
            mainColumns: getComputedStyle(document.querySelector('#view-knowledge .main-layout')).gridTemplateColumns.split(' ').length,
            articleWidth: Math.round(document.querySelector('#view-knowledge .article-card').getBoundingClientRect().width),
            viewGap: getComputedStyle(document.getElementById('view-knowledge')).gap
        }));
        assert.strictEqual(knowledgeBackground.yellow, '0', 'home warm background must be hidden in knowledge view');
        assert.strictEqual(knowledgeBackground.grid, '1', 'knowledge grid background must remain visible');
        assert.strictEqual(knowledgeBackground.toolsGlow, '0', 'tools glow background must be hidden in knowledge view');
        assert.strictEqual(knowledgeBackground.toolsNoise, '0', 'tools noise background must be hidden in knowledge view');
        assert.strictEqual(knowledgeBackground.shellPadding, '28px 18px 40px', 'knowledge shell padding must match old page');
        assert.strictEqual(knowledgeBackground.mainColumns, 2, 'knowledge desktop layout must keep old two-column grid');
        assert(knowledgeBackground.articleWidth > 780, 'knowledge article cards must use old desktop content width');
        assert.strictEqual(knowledgeBackground.viewGap, '14px', 'knowledge mode tabs and content layout must not visually overlap');

        const knowledgeOverlap = await page.evaluate(() => {
            function rect(selector) {
                const el = document.querySelector(selector);
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return {
                    left: r.left,
                    top: r.top,
                    right: r.right,
                    bottom: r.bottom,
                    width: r.width,
                    height: r.height
                };
            }
            return {
                tabs: rect('#view-knowledge .mode-tabs'),
                sidebar: rect('#view-knowledge .content-sidebar'),
                list: rect('#article-list'),
                firstCard: rect('#article-list .article-card'),
                detail: rect('#article-detail'),
                editor: rect('#editor-view')
            };
        });
        assert.strictEqual(rectsOverlap(knowledgeOverlap.tabs, knowledgeOverlap.sidebar), false, 'knowledge mode tabs must not overlap sidebar');
        assert.strictEqual(rectsOverlap(knowledgeOverlap.tabs, knowledgeOverlap.list), false, 'knowledge mode tabs must not overlap article list');
        assert.strictEqual(rectsOverlap(knowledgeOverlap.sidebar, knowledgeOverlap.list), false, 'knowledge sidebar must not overlap article list');
        assert.strictEqual(rectsOverlap(knowledgeOverlap.list, knowledgeOverlap.detail), false, 'knowledge list and detail views must not overlap');
        assert.strictEqual(rectsOverlap(knowledgeOverlap.list, knowledgeOverlap.editor), false, 'knowledge list and editor views must not overlap');
        assert(knowledgeOverlap.firstCard.top >= knowledgeOverlap.list.top, 'first knowledge article card must stay inside list flow');

        for (const view of ['tools', 'knowledge', 'home', 'knowledge', 'tools', 'home']) {
            await page.click(`[data-view="${view}"]`);
            await delay(90);
        }
        await delay(1200);
        const transitionState = await page.evaluate(() => ({
            bodyView: document.body.dataset.activeView,
            activePanels: Array.from(document.querySelectorAll('.view-panel.active')).map(el => el.id),
            leavingPanels: Array.from(document.querySelectorAll('.view-panel.leaving')).map(el => el.id),
            enteringPanels: Array.from(document.querySelectorAll('.view-panel.entering')).map(el => el.id),
            currentView: window.ViewManager && window.ViewManager.getCurrent()
        }));
        assert.strictEqual(transitionState.bodyView, 'home', 'rapid navigation must land on the last requested view');
        assert.deepStrictEqual(transitionState.activePanels, ['view-home'], 'rapid navigation must leave one active panel');
        assert.deepStrictEqual(transitionState.leavingPanels, [], 'rapid navigation must clear leaving panels');
        assert.deepStrictEqual(transitionState.enteringPanels, [], 'rapid navigation must clear entering panels');
        assert.strictEqual(transitionState.currentView, 'home', 'ViewManager current view must match body active view');

        await page.click('[data-view="home"]');
        await page.waitForFunction(
            () => document.body.dataset.activeView === 'home'
                && document.getElementById('view-home').classList.contains('active'),
            { timeout: 10000 }
        );
        await page.click('#btn-dpk');
        await page.type('#barcode-input', '123456789012');
        await delay(300);

        const homeState = await page.evaluate(() => ({
            input: document.getElementById('barcode-input').value,
            valid: document.getElementById('stat-valid').textContent,
            barcodeCount: document.querySelectorAll('#barcode-output .barcode-item').length,
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
        }));
        assert.strictEqual(homeState.input, 'DPK123456789012');
        assert.strictEqual(homeState.valid, '1');
        assert.strictEqual(homeState.barcodeCount, 1);
        assert.strictEqual(homeState.overflow, false, 'desktop layout must not overflow horizontally');

        const uploadStyleState = await page.evaluate(() => {
            const ocrTitle = document.querySelector('#ocr-dropzone strong');
            const ocrHelp = document.querySelector('#ocr-dropzone > span:not(.ocr-target-mark)');
            const tableTitle = document.querySelector('#data-tools-dropzone strong');
            const tableHelp = document.querySelector('#data-tools-dropzone > span:not(.ocr-target-mark)');
            return {
                ocrTitleSize: getComputedStyle(ocrTitle).fontSize,
                ocrTitleWeight: getComputedStyle(ocrTitle).fontWeight,
                ocrHelpSize: getComputedStyle(ocrHelp).fontSize,
                ocrHelpLineHeight: getComputedStyle(ocrHelp).lineHeight,
                tableTitleSize: getComputedStyle(tableTitle).fontSize,
                tableHelpSize: getComputedStyle(tableHelp).fontSize,
                tableTextAlign: getComputedStyle(document.getElementById('data-tools-dropzone')).textAlign
            };
        });
        assert.strictEqual(uploadStyleState.ocrTitleSize, '14px', 'OCR dropzone title typography must match old card style');
        assert(Number(uploadStyleState.ocrTitleWeight) >= 700, 'OCR dropzone title must keep strong hierarchy');
        assert.strictEqual(uploadStyleState.ocrHelpSize, '12px', 'OCR dropzone helper copy must match old card style');
        assert.strictEqual(uploadStyleState.ocrHelpLineHeight, '18.6px', 'OCR dropzone helper line-height must stay readable');
        assert.strictEqual(uploadStyleState.tableTitleSize, '13px', 'table image dropzone title must match old card size');
        assert.strictEqual(uploadStyleState.tableHelpSize, '11.5px', 'table image dropzone helper copy must be compact and coordinated');
        assert.strictEqual(uploadStyleState.tableTextAlign, 'center', 'table image dropzone text must stay centered');

        await page.click('#btn-user');
        await page.waitForSelector('#miaosite-auth-modal.show .miaosite-auth-card', { timeout: 10000 });
        const authStyleState = await page.evaluate(() => {
            const overlay = document.getElementById('miaosite-auth-modal');
            const card = document.querySelector('.miaosite-auth-card');
            const submit = document.getElementById('miaosite-auth-submit');
            const input = document.getElementById('miaosite-auth-username');
            const overlayRect = overlay.getBoundingClientRect();
            const cardRect = card.getBoundingClientRect();
            const cardStyle = getComputedStyle(card);
            const submitStyle = getComputedStyle(submit);
            const inputStyle = getComputedStyle(input);
            return {
                overlayWidth: Math.round(overlayRect.width),
                cardWidth: Math.round(cardRect.width),
                cardRadius: cardStyle.borderRadius,
                cardBackground: cardStyle.backgroundImage,
                submitRadius: submitStyle.borderRadius,
                submitBackground: submitStyle.backgroundImage,
                inputRadius: inputStyle.borderRadius,
                inputFontSize: inputStyle.fontSize
            };
        });
        assert(authStyleState.overlayWidth >= 1200, 'auth modal overlay must cover desktop viewport');
        assert(authStyleState.cardWidth <= 430, 'auth card must fit shell width');
        assert.strictEqual(authStyleState.cardRadius, '28px', 'auth card must use polished rounded glass surface');
        assert(/linear-gradient/.test(authStyleState.cardBackground), 'auth card must use warm glass gradient');
        assert.strictEqual(authStyleState.submitRadius, '16px', 'auth submit button must match site rounded controls');
        assert(/linear-gradient/.test(authStyleState.submitBackground), 'auth submit button must use warm accent gradient');
        assert.strictEqual(authStyleState.inputRadius, '16px', 'auth inputs must match site rounded controls');
        assert.strictEqual(authStyleState.inputFontSize, '14px', 'auth input text must match site typography');
        await page.click('.miaosite-auth-card .auth-close');
        await page.waitForFunction(() => !document.getElementById('miaosite-auth-modal').classList.contains('show'), { timeout: 5000 });
        await delay(300);

    } finally {
        await browser.close();
    }
}

run().then(() => {
    console.log('SPA regression check passed');
}).catch(error => {
    console.error(error);
    process.exit(1);
});
