/**
 * The service worker precaches the app shell by hand. A module added to `js/`
 * and forgotten here still works online — it is fetched and cached on demand —
 * but it is missing from the offline shell, and nothing says so. This test is
 * the thing that says so.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const sw = readFileSync('sw.js', 'utf8');

/** Every `.js` under `js/`, as the repo-relative paths sw.js uses. */
function modules(dir = 'js') {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return modules(path);
        return entry.name.endsWith('.js') ? [path] : [];
    });
}

describe('service worker shell', () => {
    it('precaches every module the app can load', () => {
        const missing = modules().filter(path => !sw.includes(`'${path}'`));
        expect(missing).toEqual([]);
    });

    it('lists nothing that no longer exists', () => {
        const listed = [...sw.matchAll(/'(js\/[^']+\.js)'/g)].map(m => m[1]);
        const present = new Set(modules());
        expect(listed.filter(path => !present.has(path))).toEqual([]);
    });
});
