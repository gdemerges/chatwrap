// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { refuseFraming } from '../js/ui/chrome.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** A window whose `top` is something else, or throws like a cross-origin one. */
const framedWindow = (top) => ({
    self: {},
    get top() { if (top === 'throws') throw new Error('cross-origin'); return top; },
    document,
});

describe('refuseFraming', () => {
    afterEach(() => document.documentElement.classList.remove('is-framed'));

    it('leaves a top-level page alone', () => {
        expect(refuseFraming(window)).toBe(false);
        expect(document.documentElement.classList.contains('is-framed')).toBe(false);
    });

    it('hides a page framed by another one', () => {
        expect(refuseFraming(framedWindow({}))).toBe(true);
        expect(document.documentElement.classList.contains('is-framed')).toBe(true);
    });

    it('treats an unreadable top as framed', () => {
        expect(refuseFraming(framedWindow('throws'))).toBe(true);
    });

    it('is wired into both pages, with the rule that hides them', () => {
        for (const entry of ['js/app.js', 'js/dashboard.js']) {
            expect(readFileSync(resolve(root, entry), 'utf-8')).toMatch(/^refuseFraming\(\);$/m);
        }
        expect(readFileSync(resolve(root, 'css/style.css'), 'utf-8'))
            .toMatch(/\.is-framed body \{ display: none !important; \}/);
    });
});
