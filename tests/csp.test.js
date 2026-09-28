/**
 * The Content-Security-Policy is a `<meta>` in two HTML files, and the origins
 * it must allow are written in three other places (`vendor.js`, the worker,
 * the service worker). Nothing ties them together, so a CDN change made in one
 * spot fails only in a browser, only on the page that needs it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p), 'utf-8');

function policy(page) {
    const m = read(page).match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/);
    if (!m) throw new Error(`${page} has no CSP`);
    return Object.fromEntries(m[1].split(';').map((d) => {
        const [name, ...values] = d.trim().split(/\s+/);
        return [name, values];
    }));
}

function walk(dir) {
    return readdirSync(dir).flatMap((f) => {
        const p = join(dir, f);
        return statSync(p).isDirectory() ? walk(p) : [p];
    });
}

const PAGES = ['index.html', 'dashboard.html'];

describe.each(PAGES)('%s CSP', (page) => {
    const csp = policy(page);

    it('allows no inline or eval code anywhere', () => {
        for (const [directive, values] of Object.entries(csp)) {
            expect(values, directive).not.toContain("'unsafe-inline'");
            expect(values, directive).not.toContain("'unsafe-eval'");
        }
    });

    it('forbids plugins, framing and form posts', () => {
        expect(csp['object-src']).toEqual(["'none'"]);
        expect(csp['frame-ancestors']).toEqual(["'none'"]);
        expect(csp['form-action']).toEqual(["'none'"]);
    });
});

describe('origins used by the code are declared', () => {
    const index = policy('index.html');
    const cdnFiles = ['js/vendor.js', 'js/worker/sentiment-ml.js', 'sw.js'];

    it.each(cdnFiles)('%s only fetches from origins the app page allows', (file) => {
        const origins = new Set(read(file).match(/https:\/\/[a-z0-9.-]+/g) ?? []);
        const allowed = new Set([...index['script-src'], ...index['connect-src']]);
        for (const o of origins) expect(allowed.has(o), `${o} in ${file}`).toBe(true);
    });

    it('the dashboard does not open more than the app page does', () => {
        const dash = policy('dashboard.html');
        for (const [directive, values] of Object.entries(dash)) {
            for (const v of values) expect(index[directive] ?? [], directive).toContain(v);
        }
    });
});

describe('no inline style attributes', () => {
    // A `style="…"` in markup is blocked by `style-src 'self'`; dynamic values go
    // through `data-css` (see js/ui/inline-style.js).
    const files = [...walk(resolve(root, 'js')).filter((f) => f.endsWith('.js')),
        resolve(root, 'index.html'), resolve(root, 'dashboard.html')];

    it.each(files.map((f) => [f.slice(root.length + 1).replaceAll('\\', '/'), f]))('%s', (_, f) => {
        expect(readFileSync(f, 'utf-8')).not.toMatch(/\sstyle=["']/);
    });
});
