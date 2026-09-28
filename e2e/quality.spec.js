/**
 * Things no unit test can see because they are properties of a real browser
 * enforcing real policy: the Content-Security-Policy, and accessibility as
 * computed from the rendered page.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** Record every CSP violation the page raises, from before any script runs. */
async function watchViolations(page) {
    await page.addInitScript(() => {
        window.__csp = [];
        document.addEventListener('securitypolicyviolation', (e) => {
            window.__csp.push(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile ?? ''}:${e.lineNumber ?? ''}`);
        });
    });
    return () => page.evaluate(() => window.__csp);
}

test('walking every slide raises no CSP violation, and dynamic styles are applied', async ({ page }) => {
    const violations = await watchViolations(page);
    await page.goto('/index.html#demo');
    await expect(page.locator('#wrapped-screen')).toHaveClass(/active/);

    const total = await page.locator('#slides-container .slide').count();
    for (let i = 1; i < total; i++) {
        await page.keyboard.press('ArrowRight');
        await expect(page.locator('#slide-counter')).toHaveText(new RegExp(`^${i + 1} /`));
        await expect(page.locator('#slides-container .slide.active')).toHaveCount(1);
    }

    expect(await violations()).toEqual([]);
    // Nothing may be left waiting to be converted…
    expect(await page.locator('[data-css]').count()).toBe(0);
    // …and the values must really have landed: a ranking bar is sized by a
    // custom property that only the observer could have set.
    const bars = page.locator('.ranking-bar-fill');
    if (await bars.count()) {
        const width = await bars.first().evaluate((el) => el.style.getPropertyValue('--bar-width'));
        expect(width).toMatch(/%$/);
    }
});

test('the dashboard raises no CSP violation either', async ({ page }) => {
    const violations = await watchViolations(page);
    await page.goto('/index.html#demo');
    await expect(page.locator('#wrapped-screen')).toHaveClass(/active/);
    await page.locator('#summary-btn').click();
    await page.waitForURL(/dashboard\.html/);
    await expect(page.locator('table').first()).toBeVisible();

    expect(await violations()).toEqual([]);
    expect(await page.locator('[data-css]').count()).toBe(0);
});

/**
 * Let entrance animations and theme transitions finish. axe reads the colour a
 * pixel has *right now*, so a card mid-fade reports a contrast nobody sees.
 */
async function settleAnimations(page) {
    await page.evaluate(async () => {
        await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {})));
        await new Promise((r) => setTimeout(r, 600));
    });
}

const A11Y_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

for (const theme of ['dark', 'light']) {
    test(`landing page has no axe violations (${theme})`, async ({ page }) => {
        await page.addInitScript((th) => localStorage.setItem('theme', th), theme);
        await page.goto('/index.html');
        await expect(page.locator('#drop-zone')).toBeVisible();
        await settleAnimations(page);
        const { violations } = await new AxeBuilder({ page }).withTags(A11Y_TAGS).analyze();
        expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    });

    test(`dashboard has no axe violations (${theme})`, async ({ page }) => {
        await page.addInitScript((th) => localStorage.setItem('theme', th), theme);
        await page.goto('/index.html#demo');
        await expect(page.locator('#wrapped-screen')).toHaveClass(/active/);
        await page.locator('#summary-btn').click();
        await page.waitForURL(/dashboard\.html/);
        await expect(page.locator('table').first()).toBeVisible();
        await settleAnimations(page);
        const { violations } = await new AxeBuilder({ page }).withTags(A11Y_TAGS).analyze();
        expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    });
}
