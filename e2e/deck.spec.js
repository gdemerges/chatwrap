/**
 * The whole chain, in a real browser.
 *
 * Every module here has unit tests, and they all pass against jsdom — which
 * has no Web Worker and no canvas. So the three things that actually carry the
 * product are the three the unit suite cannot see:
 *
 *   • the worker parsing and computing off the main thread,
 *   • Chart.js putting pixels on a canvas,
 *   • the exporter producing a bitmap that is not blank.
 *
 * That last one is the reason this file exists. `tests/export-image.test.js`
 * drives the exporter against a recording context, which proves the layout
 * arithmetic and nothing about whether anything was drawn. iOS answers an
 * oversized canvas with an empty image and no error at all; a blank poster is
 * indistinguishable from a working one until somebody opens the PNG.
 */
import { test, expect } from '@playwright/test';

/**
 * Wait for a slide transition to finish.
 *
 * `goTo` updates the counter immediately but keeps `animating` true for the
 * length of the transition, dropping any move that arrives meanwhile — so two
 * back-to-back key presses land as one. The outgoing slide keeps its `active`
 * class until the same timer clears it, which makes "exactly one active slide"
 * both the settle signal and the invariant worth asserting.
 */
async function settle(page) {
    await expect(page.locator('#slides-container .slide.active')).toHaveCount(1);
}

/** Wait for the demo analysis to finish and the deck to be on screen. */
async function bootDemo(page) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/index.html#demo');
    await expect(page.locator('#wrapped-screen')).toHaveClass(/active/);
    // The deck is mounted lazily; slide 0 must carry real content.
    await expect(page.locator('#slide-0')).not.toBeEmpty();
    return errors;
}

test('the demo boots through the worker and mounts a deck', async ({ page }) => {
    const errors = await bootDemo(page);

    const slides = page.locator('#slides-container .slide');
    expect(await slides.count()).toBeGreaterThan(10);

    // The progress bar is the tablist, one tab per slide.
    expect(await page.locator('#story-progress [role="tab"]').count())
        .toBe(await slides.count());

    expect(errors).toEqual([]);
});

test('arrow keys move through the deck and only one slide is ever active', async ({ page }) => {
    await bootDemo(page);
    const counter = page.locator('#slide-counter');
    await expect(counter).toHaveText(/^1 \//);

    await page.keyboard.press('ArrowRight');
    await expect(counter).toHaveText(/^2 \//);
    await settle(page);
    await page.keyboard.press('ArrowRight');
    await expect(counter).toHaveText(/^3 \//);
    await settle(page);
    await page.keyboard.press('ArrowLeft');
    await expect(counter).toHaveText(/^2 \//);
    await settle(page);

    // Off-screen slides must be out of the tab order, not merely invisible.
    await expect(page.locator('#slides-container .slide.active')).not.toHaveAttribute('inert', /.*/);
    const inertCount = await page.locator('#slides-container .slide[inert]').count();
    expect(inertCount).toBe(await page.locator('#slides-container .slide').count() - 1);
});

test('Chart.js paints actual pixels on a real canvas', async ({ page }) => {
    await bootDemo(page);

    // Walk forward until a slide with a canvas comes into reach, then let the
    // lazy chart init run. Charts are pre-warmed one slide ahead, so arriving
    // on the slide is enough.
    let painted = null;
    for (let i = 0; i < 30 && painted === null; i++) {
        const canvas = page.locator('#slides-container .slide.active canvas').first();
        if (await canvas.count()) {
            painted = await canvas.evaluate(async (el) => {
                // Give Chart.js a frame or two to draw.
                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
                const ctx = el.getContext('2d');
                const { data } = ctx.getImageData(0, 0, el.width, el.height);
                let opaque = 0;
                for (let p = 3; p < data.length; p += 4) if (data[p] > 0) opaque++;
                return { opaque, total: data.length / 4 };
            });
            if (painted && painted.opaque === 0) painted = null; // not drawn yet
        }
        if (painted === null) {
            await page.keyboard.press('ArrowRight');
            await settle(page);
        }
    }

    expect(painted, 'no slide with a painted chart canvas was found').not.toBeNull();
    // A blank canvas is fully transparent; a drawn chart is not.
    expect(painted.opaque).toBeGreaterThan(0);
});

test('the A4 poster renders a bitmap that is not blank', async ({ page }) => {
    await bootDemo(page);

    // The deck hands its stats to the dashboard through sessionStorage, so
    // clicking the dashboard button is what publishes them. Using that seam
    // keeps the test on a path the app really takes, instead of asking the
    // app to expose a global it would only ever have for this test.
    // Navigating back would re-run the demo, and a new analysis clears the
    // key first thing — so the poster is rendered from the dashboard page,
    // where the stats have just been published and the modules are the same
    // same-origin files.
    await page.locator('#summary-btn').click();
    await page.waitForURL(/dashboard\.html/);

    const result = await page.evaluate(async () => {
        const [{ renderCard }, { buildPosterCard, resolvePreset }, { rehydrateDates }] =
            await Promise.all([
                import('/js/export-image.js'),
                import('/js/export-presets.js'),
                import('/js/payload.js'),
            ]);
        const raw = sessionStorage.getItem('ww-stats');
        if (!raw) return { error: 'no stats in sessionStorage' };
        const stats = rehydrateDates(JSON.parse(raw).stats);

        const canvas = await renderCard(buildPosterCard(stats), { preset: 'a4' });
        const preset = resolvePreset('a4');
        const ctx = canvas.getContext('2d');

        // Sample a grid rather than the whole bitmap: an A4 poster is ~8.7M
        // pixels and reading them all into JS is slower than the render.
        let lit = 0;
        let total = 0;
        const step = 37;
        for (let x = 0; x < canvas.width; x += step) {
            for (let y = 0; y < canvas.height; y += step) {
                total++;
                const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
                if (a > 0 && (r + g + b) > 0) lit++;
            }
        }
        return { w: canvas.width, h: canvas.height, expected: preset, lit, total };
    });

    expect(result.error).toBeUndefined();
    expect(result.w).toBe(result.expected.widthPx);
    expect(result.h).toBe(result.expected.heightPx);
    // A full-bleed gradient means essentially *every* sample is opaque. Asking
    // only for "more than zero" was not a test: with the background fill
    // removed the drawn text alone still lit enough pixels to pass, so the
    // assertion survived a poster that was transparent everywhere it mattered.
    expect(result.lit / result.total).toBeGreaterThan(0.98);
});

test('the dashboard opens from the deck and renders its tables', async ({ page }) => {
    await bootDemo(page);
    await page.locator('#summary-btn').click();
    await page.waitForURL(/dashboard\.html/);
    await expect(page.locator('table').first()).toBeVisible();
});
