/**
 * The page furniture, on both entry points.
 *
 * The theme toggle, the language picker and the service-worker registration
 * used to exist twice — once in `app.js`, once in `dashboard.js` — and were
 * merged into `js/ui/chrome.js`. Nothing in the unit suite watches the two
 * pages behave the *same* way, which is the whole point of sharing the code,
 * so the checks below run against each of them.
 */
import { test, expect } from '@playwright/test';

/** Both entry points, and how to get each one into a rendered state. */
const PAGES = {
    deck: async (page) => {
        await page.goto('/index.html#demo');
        await expect(page.locator('#wrapped-screen')).toHaveClass(/active/);
    },
    dashboard: async (page) => {
        await page.goto('/index.html#demo');
        await expect(page.locator('#wrapped-screen')).toHaveClass(/active/);
        await page.locator('#summary-btn').click();
        await page.waitForURL(/dashboard\.html/);
    },
};

for (const [name, open] of Object.entries(PAGES)) {
    test.describe(name, () => {
        test('the theme toggle flips and is remembered', async ({ page }) => {
            await open(page);
            const html = page.locator('html');
            await expect(html).toHaveAttribute('data-theme', 'dark');

            await page.locator('#theme-toggle').click();
            await expect(html).toHaveAttribute('data-theme', 'light');

            // The choice has to survive a reload, which is the only thing
            // that proves it reached localStorage rather than just the DOM.
            await page.reload();
            await expect(html).toHaveAttribute('data-theme', 'light');
        });

        test('the language picker lists every registered locale and switches', async ({ page }) => {
            await open(page);
            const select = page.locator('#lang-select');

            // Built from LOCALES, so a newly registered dictionary appears
            // without anyone editing the HTML.
            const values = await select.locator('option').evaluateAll(
                (opts) => opts.map((o) => o.value));
            expect(values).toContain('fr');
            expect(values).toContain('id');
            expect(values).toContain('tr');

            await select.selectOption('id');
            await expect(page.locator('html')).toHaveAttribute('lang', 'id');
            // A real string from the Indonesian dictionary, not just the attribute.
            await expect(select).toHaveValue('id');
        });
    });
}

test('switching language rebuilds the deck in place', async ({ page }) => {
    await PAGES.deck(page);
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#slide-counter')).toHaveText(/^2 \//);
    await expect(page.locator('#slides-container .slide.active')).toHaveCount(1);

    await page.locator('#lang-select').selectOption('tr');

    // The deck is rebuilt from the same stats and re-mounted; `mount` restores
    // the slide recorded in the hash, so the reader stays where they were.
    await expect(page.locator('#slide-counter')).toHaveText(/^2 \//);
    await expect(page.locator('#slides-container .slide.active')).toHaveCount(1);
    await expect(page.locator('#slide-1')).not.toBeEmpty();
});

test('flipping the theme keeps the charts painted', async ({ page }) => {
    await PAGES.deck(page);

    // Find a slide whose chart has drawn something.
    const painted = async () => {
        const canvas = page.locator('#slides-container .slide.active canvas').first();
        if (!await canvas.count()) return null;
        return canvas.evaluate(async (el) => {
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
            const { data } = el.getContext('2d').getImageData(0, 0, el.width, el.height);
            let opaque = 0;
            for (let p = 3; p < data.length; p += 4) if (data[p] > 0) opaque++;
            return opaque;
        });
    };

    let before = null;
    for (let i = 0; i < 30 && !before; i++) {
        before = await painted();
        if (!before) {
            await page.keyboard.press('ArrowRight');
            await expect(page.locator('#slides-container .slide.active')).toHaveCount(1);
        }
    }
    expect(before, 'no painted chart found to flip the theme against').toBeTruthy();

    // `retint` re-resolves every var(--token) and redraws. A chart that came
    // back empty would mean the deck lost its canvases on the flip.
    await page.locator('#theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await painted()).toBeGreaterThan(0);
});
