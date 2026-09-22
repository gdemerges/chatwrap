/**
 * The service worker precaches the app shell by hand. A module added to `js/`
 * and forgotten here still works online — it is fetched and cached on demand —
 * but it is missing from the offline shell, and nothing says so. This test is
 * the thing that says so.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { posix } from 'node:path';

const sw = readFileSync('sw.js', 'utf8');

/** Every `.js` under `js/`, as the repo-relative paths sw.js uses. */
function modules(dir = 'js') {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const path = posix.join(dir, entry.name); // sw.js lists '/' paths, on Windows too
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

describe('service worker cache name', () => {
    // The deploy job rewrites this exact literal to `ww-shell-<commit>` with
    // sed. If it drifts, the rewrite silently misses and every release ships
    // under the same cache name again — the grep in ci.yml would fail the
    // deploy, but this says why before anything is pushed.
    it('is the placeholder the deploy step rewrites', () => {
        expect(sw).toContain("const CACHE_NAME = 'ww-shell-dev';");
        expect(readFileSync('.github/workflows/ci.yml', 'utf8'))
            .toContain("s/const CACHE_NAME = 'ww-shell-dev'/");
    });
});
