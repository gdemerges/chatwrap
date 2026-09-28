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
