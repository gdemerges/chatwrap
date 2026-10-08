/**
 * The service worker precaches the app shell by hand. A module added to `js/`
 * and forgotten here still works online — it is fetched and cached on demand —
 * but it is missing from the offline shell, and nothing says so. This test is
 * the thing that says so.
 */
import { describe, it, expect, vi } from 'vitest';
import vm from 'node:vm';
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

/* global Request, FormData, Response */
describe('share inbox constants', () => {
    // sw.js cannot import js/import.js, so both copies are written out. This is
    // the check that keeps them the same.
    const imp = readFileSync('js/import.js', 'utf8');
    const literal = (src, name) => src.match(new RegExp(`const ${name} = '([^']+)'`))?.[1];

    it.each(['SHARE_CACHE', 'SHARE_KEY'])('%s is the same in sw.js and js/import.js', (name) => {
        expect(literal(imp, name)).toBeDefined();
        expect(literal(sw, name)).toBe(literal(imp, name));
    });
});

describe('service worker share target', () => {
    const SCOPE = 'https://chatwrap.test/app/';

    /** A minimal ServiceWorkerGlobalScope: records listeners, lets tests fire them. */
    function loadWorker({ storage }) {
        const listeners = {};
        const fetchSpy = vi.fn();
        const self = {
            location: new URL(SCOPE + 'sw.js'),
            registration: { scope: SCOPE },
            addEventListener: (type, fn) => { listeners[type] = fn; },
            skipWaiting: async () => {},
            clients: { claim: async () => {} },
        };
        vm.runInNewContext(sw, {
            self, caches: storage, fetch: fetchSpy, console, URL, Response, Request,
        });
        return { listeners, fetchSpy };
    }

    /** CacheStorage backed by Maps, so tests can look inside what was parked. */
    function fakeCaches(seed = {}) {
        const stores = new Map(Object.entries(seed).map(([name, entries]) => [name, new Map(Object.entries(entries))]));
        const open = async (name) => {
            if (!stores.has(name)) stores.set(name, new Map());
            const store = stores.get(name);
            return {
                put: async (key, response) => { store.set(key, response); },
                match: async (key) => store.get(key)?.clone(),
                delete: async (key) => store.delete(key),
            };
        };
        const storage = {
            stores,
            open: vi.fn(open),
            keys: vi.fn(async () => [...stores.keys()]),
            delete: vi.fn(async (name) => stores.delete(name)),
        };
        return storage;
    }

    const shareRequest = (files = [], path = 'share-target') => {
        const body = new FormData();
        for (const f of files) body.append('chat', f);
        return new Request(SCOPE + path, { method: 'POST', body });
    };

    /** Fire a fetch event; resolve with the response the worker gave, if it took the request. */
    async function dispatch(listeners, request) {
        let answer;
        const event = { request, respondWith: vi.fn((p) => { answer = p; }) };
        listeners.fetch(event);
        return { event, response: answer ? await answer : undefined };
    }

    it('parks the shared file in ww-share-inbox and redirects to index.html#shared', async () => {
        const storage = fakeCaches();
        const { listeners, fetchSpy } = loadWorker({ storage });
        const file = new File(['Bonjour'], 'Discussion avec Zoé.txt', { type: 'text/plain' });

        const { event, response } = await dispatch(listeners, shareRequest([file]));

        expect(event.respondWith).toHaveBeenCalledTimes(1);
        expect(response.status).toBe(303);
        expect(response.headers.get('location')).toBe(SCOPE + 'index.html#shared');

        expect(storage.open).toHaveBeenCalledWith('ww-share-inbox');
        const parked = storage.stores.get('ww-share-inbox').get('share-inbox/latest');
        expect(parked.headers.get('content-type')).toBe('text/plain');
        expect(decodeURIComponent(parked.headers.get('x-filename'))).toBe('Discussion avec Zoé.txt');
        expect(await parked.text()).toBe('Bonjour');
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('keeps only the first chat file when several are shared', async () => {
        const storage = fakeCaches();
        const { listeners } = loadWorker({ storage });
        await dispatch(listeners, shareRequest([
            new File(['premier'], 'a.txt', { type: 'text/plain' }),
            new File(['second'], 'b.txt', { type: 'text/plain' }),
        ]));
        const parked = storage.stores.get('ww-share-inbox').get('share-inbox/latest');
        expect(await parked.text()).toBe('premier');
    });

    it('with no file, redirects to plain index.html and parks nothing', async () => {
        const storage = fakeCaches();
        const { listeners, fetchSpy } = loadWorker({ storage });

        const { response } = await dispatch(listeners, shareRequest([]));

        expect(response.status).toBe(303);
        expect(response.headers.get('location')).toBe(SCOPE + 'index.html');
        expect(storage.open).not.toHaveBeenCalled();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('still redirects to #shared when the inbox cannot be written, and never goes to the network', async () => {
        const storage = fakeCaches();
        storage.open.mockRejectedValueOnce(new Error('quota exceeded'));
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { listeners, fetchSpy } = loadWorker({ storage });

        const { response } = await dispatch(listeners, shareRequest([new File(['x'], 'a.txt')]));

        expect(response.headers.get('location')).toBe(SCOPE + 'index.html#shared');
        expect(fetchSpy).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    it('leaves other POSTs to the browser', async () => {
        const storage = fakeCaches();
        const { listeners, fetchSpy } = loadWorker({ storage });

        const { event, response } = await dispatch(listeners, shareRequest([], 'somewhere-else'));

        expect(event.respondWith).not.toHaveBeenCalled();
        expect(response).toBeUndefined();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('keeps ww-share-inbox through activate, and still drops old shells', async () => {
        const storage = fakeCaches({
            'ww-shell-old': {},
            'ww-shell-dev': {},
            'ww-cdn-v1': {},
            'ww-share-inbox': { 'share-inbox/latest': new Response('x') },
        });
        const { listeners } = loadWorker({ storage });
        let pending;
        listeners.activate({ waitUntil: (p) => { pending = p; } });
        await pending;

        expect(storage.delete).toHaveBeenCalledTimes(1);
        expect(storage.delete).toHaveBeenCalledWith('ww-shell-old');
        expect(storage.stores.has('ww-share-inbox')).toBe(true);
    });
});
