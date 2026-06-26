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
        await page.setCacheEnabled(false);
        await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
        await page.goto(BASE_URL + '?home_input_weather_check=1', { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForSelector('#view-home.active', { timeout: 10000 });
        await page.evaluate(() => localStorage.removeItem('miaosite_weather_recent_cities'));

        const weatherSurfaceState = await page.evaluate(() => {
            const card = document.getElementById('weather-card');
            const style = getComputedStyle(card);
            const inlineBackdrop = [
                card.style.backdropFilter,
                card.style.webkitBackdropFilter
            ].filter(Boolean).join(' ');
            const computedBackdrop = [
                style.backdropFilter,
                style.webkitBackdropFilter
            ].filter(Boolean).join(' ');
            return {
                hasGlassSurfaceSvg: !!card.querySelector(':scope > .glass-surface-svg'),
                inlineBackdrop,
                computedBackdrop,
                background: style.backgroundImage,
                boxShadow: style.boxShadow
            };
        });
        assert.strictEqual(
            weatherSurfaceState.hasGlassSurfaceSvg,
            false,
            'weather card should not inject SVG GlassSurface because it creates a visible rectangular filter frame'
        );
        assert(
            !/url\(#gs-filter/i.test(weatherSurfaceState.inlineBackdrop + ' ' + weatherSurfaceState.computedBackdrop),
            'weather card should not use SVG backdrop-filter url because it creates a visible rectangular filter frame'
        );
        assert(
            /linear-gradient/.test(weatherSurfaceState.background),
            'weather card should keep its own independent gradient surface'
        );
        assert(
            !/rgba\(40,\s*2,\s*60,\s*0\.2\)/i.test(weatherSurfaceState.boxShadow),
            'weather card should not use the old dark rectangular shadow frame'
        );

        await page.click('#barcode-input');
        await new Promise(resolve => setTimeout(resolve, 250));
        const focusState = await page.evaluate(() => ({
            activeId: document.activeElement && document.activeElement.id,
            inputFocused: document.activeElement === document.getElementById('barcode-input'),
            cityOpen: document.getElementById('weather-city-wrap').classList.contains('is-open')
        }));
        assert.strictEqual(focusState.inputFocused, true, `barcode input should keep focus, active element was ${focusState.activeId}`);
        assert.strictEqual(focusState.cityOpen, false, 'weather city dropdown should not open or react when focusing barcode input');

        await page.click('#weather-city-trigger');
        await page.waitForSelector('#weather-city-wrap.is-open #weather-city-input', { timeout: 5000 });
        await page.waitForFunction(() => {
            const dropdown = document.getElementById('weather-city-dropdown');
            const rect = dropdown.getBoundingClientRect();
            return rect.left >= 8 && rect.right <= window.innerWidth - 8;
        }, { timeout: 5000 });

        const quickPickerState = await page.evaluate(() => {
            const dropdown = document.getElementById('weather-city-dropdown');
            const quick = document.getElementById('weather-city-quick');
            const chips = Array.from(document.querySelectorAll('#weather-city-quick .weather-city-chip'));
            return {
                expanded: document.getElementById('weather-city-trigger').getAttribute('aria-expanded'),
                listRole: document.getElementById('weather-city-list').getAttribute('role'),
                dropdownLeft: Math.round(dropdown.getBoundingClientRect().left),
                dropdownRight: Math.round(dropdown.getBoundingClientRect().right),
                dropdownWidth: Math.round(dropdown.getBoundingClientRect().width),
                quickVisible: !!quick && getComputedStyle(quick).display !== 'none',
                chipCount: chips.length,
                chipText: chips.map(chip => chip.textContent.trim()).join('|')
            };
        });
        assert.strictEqual(quickPickerState.expanded, 'true', 'weather city trigger should expose open state');
        assert.strictEqual(quickPickerState.listRole, 'listbox', 'weather city options should expose a listbox role');
        assert(quickPickerState.dropdownLeft >= 8, 'weather city dropdown should not overflow the left viewport edge');
        assert(quickPickerState.dropdownRight <= 1432, 'weather city dropdown should not overflow the right viewport edge');
        assert(quickPickerState.dropdownWidth >= 270, 'weather city dropdown should have room for the optimized picker');
        assert.strictEqual(quickPickerState.quickVisible, true, 'weather city dropdown should show quick city groups');
        assert(quickPickerState.chipCount >= 8, 'weather city picker should expose multiple quick city chips');
        assert(/上海/.test(quickPickerState.chipText), 'quick city chips should include major cities');

        await page.type('#weather-city-input', 'suz');
        await page.waitForFunction(() => {
            const list = document.getElementById('weather-city-list');
            return list && /苏州/.test(list.textContent);
        }, { timeout: 5000 });

        const pinyinSearchState = await page.evaluate(() => {
            const active = document.querySelector('#weather-city-list .weather-city-option.is-active');
            return {
                optionText: document.getElementById('weather-city-list').textContent,
                activeCity: active && active.dataset.city
            };
        });
        assert(/苏州/.test(pinyinSearchState.optionText), 'weather city search should match pinyin input');
        assert.strictEqual(pinyinSearchState.activeCity, '苏州', 'first pinyin search result should be keyboard-active');

        await page.evaluate(() => {
            const input = document.getElementById('weather-city-input');
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.type('#weather-city-input', '张家界');
        await page.waitForFunction(() => {
            const custom = document.querySelector('#weather-city-list .weather-city-option[data-custom="true"]');
            return custom && custom.dataset.city === '张家界';
        }, { timeout: 5000 });

        const customCityState = await page.evaluate(() => {
            const custom = document.querySelector('#weather-city-list .weather-city-option[data-custom="true"]');
            return {
                city: custom && custom.dataset.city,
                text: custom && custom.textContent
            };
        });
        assert.strictEqual(customCityState.city, '张家界', 'weather city search should offer custom city lookup');
        assert(/张家界/.test(customCityState.text), 'custom city row should show the typed city');

        await page.evaluate(() => {
            const input = document.getElementById('weather-city-input');
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.click('#weather-city-quick .weather-city-chip[data-city="上海"]');
        await page.waitForFunction(
            () => !document.getElementById('weather-city-wrap').classList.contains('is-open')
                && document.getElementById('weather-city-trigger').getAttribute('aria-expanded') === 'false'
                && document.getElementById('weather-city').textContent.trim() === '上海',
            { timeout: 5000 }
        );

        await page.click('#weather-city-trigger');
        await page.waitForSelector('#weather-city-wrap.is-open #weather-city-quick .weather-city-chip[data-city="上海"]', { timeout: 5000 });
        const recentState = await page.evaluate(() => {
            const recent = document.querySelector('#weather-city-quick .weather-city-chip[data-city="上海"][data-source="recent"]');
            const sectionTitle = document.querySelector('#weather-city-quick .weather-city-quick-title');
            return {
                recentVisible: !!recent,
                sectionTitle: sectionTitle && sectionTitle.textContent
            };
        });
        assert.strictEqual(recentState.recentVisible, true, 'selected quick city should appear in recent cities');
        assert(/最近/.test(recentState.sectionTitle), 'recent city section should be labeled clearly');
    } finally {
        await browser.close();
    }
}

run().then(() => {
    console.log('Home input and weather check passed');
}).catch(error => {
    console.error(error);
    process.exit(1);
});
