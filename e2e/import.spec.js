/**
 * The path every real user takes and the demo skips: a file chosen from disk.
 *
 * `#demo` builds its conversation in-process, so it proves the worker and the
 * deck but never the input element, the file reader or the parser's rejection
 * of something that is not a chat. This drives the real `<input type="file">`.
 */
import { test, expect } from '@playwright/test';

/** An iOS-format French export: two people, 40 days, enough to clear the minimum. */
function chat(lines = 600) {
    const out = [];
    const say = ['Salut !', 'Ça va ?', 'On se voit demain', 'Trop bien 😊', 'mdr', 'Oui à 14h', 'Parfait ☕'];
    for (let i = 0; i < lines; i++) {
        const day = 1 + (i % 28);
        const month = 1 + Math.floor(i / 300);
        const h = 8 + (i % 14);
        const m = (i * 7) % 60;
        const who = i % 3 === 0 ? 'Bob' : 'Alice';
        const pad = (n) => String(n).padStart(2, '0');
        out.push(`[${pad(day)}/${pad(month)}/2024 ${pad(h)}:${pad(m)}:00] ${who}: ${say[i % say.length]}`);
    }
    return out.join('\n');
}

test('a chat file chosen from disk goes through the worker to a deck', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/index.html');

    await page.locator('#file-input').setInputFiles({
        name: 'chat.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from(chat(), 'utf-8'),
    });

    await expect(page.locator('#wrapped-screen')).toHaveClass(/active/);
    await expect(page.locator('#slide-0')).not.toBeEmpty();
    // Both participants must have come out of the parser.
    await expect(page.locator('#slides-container')).toContainText('Alice');
    await expect(page.locator('#slides-container')).toContainText('Bob');
    expect(errors).toEqual([]);
});

test('a file that is not a chat lands on the error screen, with a way out', async ({ page }) => {
    await page.goto('/index.html');
    await page.locator('#file-input').setInputFiles({
        name: 'notes.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('Liste de courses\nlait\noeufs\npain\n'.repeat(20), 'utf-8'),
    });

    await expect(page.locator('#error-screen')).toHaveClass(/active/);
    await expect(page.locator('#error-message')).not.toBeEmpty();
    // The retry button has to bring the drop zone back.
    await page.locator('#error-retry').click();
    await expect(page.locator('#drop-zone')).toBeVisible();
});

/* global caches, FormData */
test.describe('an export shared into the installed app', () => {
    test.skip(({ browserName }) => browserName !== 'chromium', 'Web Share Target is exercised in Chromium only');

    test('a POST to share-target is parked by the worker, and the shared page opens as a deck', async ({ page }) => {
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        await page.goto('/index.html');
        // Only a page the worker controls sends its requests through it.
        await page.evaluate(() => navigator.serviceWorker.ready);
        await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

        // The share sheet is browser-initiated, so it is not subject to the
        // page's `form-action 'none'`; a form submitted from the page would be.
        // A fetch exercises the same worker path: the worker parks the file and
        // answers the redirect, which fetch follows to index.html.
        const parked = await page.evaluate(async (text) => {
            const body = new FormData();
            body.append('chat', new File([text], 'Discussion avec Alice.txt', { type: 'text/plain' }));
            const res = await fetch('share-target', { method: 'POST', body });
            const hit = await (await caches.open('ww-share-inbox')).match('share-inbox/latest');
            return { status: res.status, parked: Boolean(hit) };
        }, chat());
        expect(parked).toEqual({ status: 200, parked: true });

        // The browser lands on index.html#shared after the 303, in a fresh
        // document. Going straight there from index.html would be a fragment
        // change, which does not reboot the page, so leave it first.
        await page.goto('about:blank');
        await page.goto('/index.html#shared');

        await expect(page.locator('#wrapped-screen')).toHaveClass(/active/);
        await expect(page.locator('#slides-container')).toContainText('Alice');
        // Read once: the file is not left behind in the inbox.
        const stillParked = await page.evaluate(async () => {
            const hit = await (await caches.open('ww-share-inbox')).match('share-inbox/latest');
            return Boolean(hit);
        });
        expect(stillParked).toBe(false);
        expect(errors).toEqual([]);
    });
});
