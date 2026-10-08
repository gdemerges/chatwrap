/**
 * The streaming hasher has to agree with the one-shot one, byte for byte:
 * they produce the cache key, and a mismatch would silently recompute every
 * export instead of serving it from IndexedDB.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hashText, createHasher, getCached, setCached, clearCache } from '../js/cache.js';

/** Feed `text` to a fresh hasher in `size`-character slices. */
async function streamed(text, size) {
    const h = createHasher();
    for (let i = 0; i < text.length; i += size) h.push(text.slice(i, i + size));
    return h.digest();
}

const small = 'bonjour tout le monde';
// Comfortably over the 1 MB threshold where the hasher switches to head/tail.
const large = 'x'.repeat(600_000) + 'MIDDLE' + 'y'.repeat(600_000);

describe('createHasher', () => {
    it('matches hashText on a small input, whatever the chunking', async () => {
        const expected = await hashText(small);
        for (const size of [1, 5, 1000]) {
            expect(await streamed(small, size)).toBe(expected);
        }
    });

    it('matches hashText once the input is sampled rather than hashed whole', async () => {
        const expected = await hashText(large);
        for (const size of [64 * 1024, 999, 1_500_000]) {
            expect(await streamed(large, size)).toBe(expected);
        }
    });

    it('separates two large files that differ only at the very end', async () => {
        const a = await streamed(large + 'A', 64 * 1024);
        const b = await streamed(large + 'B', 64 * 1024);
        expect(a).not.toBe(b);
    });

    it('separates two large files of the same length that differ at the start', async () => {
        const a = await streamed('A' + large, 64 * 1024);
        const b = await streamed('B' + large, 64 * 1024);
        expect(a).not.toBe(b);
    });

    it('hashes the empty input without complaint', async () => {
        expect(await streamed('', 10)).toBe(await hashText(''));
    });

    it('produces a 40-character SHA-1 hex digest', async () => {
        expect(await streamed(small, 3)).toMatch(/^[0-9a-f]{40}$/);
    });
});

/**
 * Minimal in-memory IndexedDB, just enough for cache.js: open with upgrade,
 * one object store, get / put / clear, transactions that complete
 * asynchronously. Knobs make open, transactions and writes fail on demand.
 */
function fakeIndexedDB({ failOpen = false, failTx = false, failWrite = false } = {}) {
    const dbs = new Map(); // name -> { version, stores: Map<storeName, Map<key, value>> }

    const makeDb = (rec) => ({
        objectStoreNames: { contains: (n) => rec.stores.has(n) },
        deleteObjectStore: (n) => { rec.stores.delete(n); },
        createObjectStore: (n) => { rec.stores.set(n, new Map()); return {}; },
        transaction(storeName) {
            if (failTx) throw new Error('transaction refused');
            const data = rec.stores.get(storeName);
            const tx = {
                error: null,
                oncomplete: null,
                onerror: null,
                objectStore: () => ({
                    get(key) {
                        const req = { result: data.get(key), onsuccess: null, onerror: null };
                        setTimeout(() => req.onsuccess?.(), 0);
                        return req;
                    },
                    put(value) {
                        if (failWrite) throw new Error('quota exceeded');
                        data.set(value.key, value);
                    },
                    clear() { data.clear(); },
                }),
            };
            setTimeout(() => tx.oncomplete?.(), 0);
            return tx;
        },
    });

    return {
        dbs,
        open(name, version) {
            const req = { result: undefined, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
            setTimeout(() => {
                if (failOpen) {
                    req.error = new Error('blocked');
                    req.onerror?.();
                    return;
                }
                let rec = dbs.get(name);
                if (!rec) { rec = { version: 0, stores: new Map() }; dbs.set(name, rec); }
                req.result = makeDb(rec);
                if (rec.version < version) {
                    rec.version = version;
                    req.onupgradeneeded?.();
                }
                req.onsuccess?.();
            }, 0);
            return req;
        },
    };
}

const DAY = 86_400_000;

describe('cache without IndexedDB', () => {
    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('getCached returns null and warns when indexedDB is not defined', async () => {
        vi.stubGlobal('indexedDB', undefined);
        expect(await getCached('k')).toBeNull();
        expect(console.warn).toHaveBeenCalled();
    });

    it('setCached and clearCache swallow the error when indexedDB is missing', async () => {
        vi.stubGlobal('indexedDB', undefined);
        await expect(setCached('k', { stats: {}, comparison: null, year: 2024 })).resolves.toBeUndefined();
        await expect(clearCache()).resolves.toBeUndefined();
        expect(console.warn).toHaveBeenCalledTimes(2);
    });

    it('getCached returns null when the open request fails', async () => {
        vi.stubGlobal('indexedDB', fakeIndexedDB({ failOpen: true }));
        expect(await getCached('k')).toBeNull();
        expect(console.warn).toHaveBeenCalledWith('[cache] read failed:', expect.any(Error));
    });

    it('getCached returns null when the transaction throws synchronously', async () => {
        vi.stubGlobal('indexedDB', fakeIndexedDB({ failTx: true }));
        expect(await getCached('k')).toBeNull();
    });

    it('setCached does not throw when the write throws (quota, private mode)', async () => {
        vi.stubGlobal('indexedDB', fakeIndexedDB({ failWrite: true }));
        await expect(setCached('k', { stats: {}, comparison: null, year: 2024 })).resolves.toBeUndefined();
        expect(console.warn).toHaveBeenCalledWith('[cache] write failed:', expect.any(Error));
    });

    it('clearCache does not throw when the transaction is refused', async () => {
        vi.stubGlobal('indexedDB', fakeIndexedDB({ failTx: true }));
        await expect(clearCache()).resolves.toBeUndefined();
        expect(console.warn).toHaveBeenCalledWith('[cache] clear failed:', expect.any(Error));
    });
});

describe('cache entries', () => {
    const payload = () => ({ stats: { total: 42 }, comparison: { other: 1 }, year: 2024 });

    beforeEach(() => {
        vi.stubGlobal('indexedDB', fakeIndexedDB());
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('returns null for a key that was never stored', async () => {
        expect(await getCached('absent')).toBeNull();
    });

    it('round-trips a payload with a savedAt timestamp', async () => {
        const before = Date.now();
        await setCached('abc', payload());
        const hit = await getCached('abc');
        expect(hit.stats).toEqual({ total: 42 });
        expect(hit.comparison).toEqual({ other: 1 });
        expect(hit.year).toBe(2024);
        expect(hit.savedAt).toBeGreaterThanOrEqual(before);
    });

    it('keeps entries separate by key', async () => {
        await setCached('a', { stats: 'A', comparison: null, year: 1 });
        await setCached('b', { stats: 'B', comparison: null, year: 2 });
        expect((await getCached('a')).stats).toBe('A');
        expect((await getCached('b')).stats).toBe('B');
    });

    it('serves an entry younger than the 14-day TTL', async () => {
        const dateNow = vi.spyOn(Date, 'now').mockReturnValue(1_000_000_000_000);
        await setCached('fresh', payload());
        dateNow.mockReturnValue(1_000_000_000_000 + 13 * DAY);
        expect(await getCached('fresh')).not.toBeNull();
    });

    it('ignores an entry older than the 14-day TTL', async () => {
        const dateNow = vi.spyOn(Date, 'now').mockReturnValue(1_000_000_000_000);
        await setCached('stale', payload());
        dateNow.mockReturnValue(1_000_000_000_000 + 15 * DAY);
        expect(await getCached('stale')).toBeNull();
    });

    it('clearCache empties the store', async () => {
        await setCached('x', payload());
        await setCached('y', payload());
        await clearCache();
        expect(await getCached('x')).toBeNull();
        expect(await getCached('y')).toBeNull();
    });

    it('a stored payload overwrites the previous one under the same key', async () => {
        await setCached('k', { stats: 'old', comparison: null, year: 1 });
        await setCached('k', { stats: 'new', comparison: null, year: 1 });
        expect((await getCached('k')).stats).toBe('new');
    });
});

describe('cache schema upgrade', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('drops the store of an older schema version so stale stats are recomputed', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const idb = fakeIndexedDB();
        // Simulate a v3 database that still holds an entry.
        const v3Stores = new Map([['stats', new Map([['old', { key: 'old', stats: 'stale', savedAt: Date.now() }]])]]);
        idb.dbs.set('wa-wrapped', { version: 3, stores: v3Stores });
        vi.stubGlobal('indexedDB', idb);

        expect(await getCached('old')).toBeNull();
        expect(idb.dbs.get('wa-wrapped').version).toBe(4);
    });

    it('keeps entries written at the current version across reopen', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.stubGlobal('indexedDB', fakeIndexedDB());
        await setCached('keep', { stats: 'kept', comparison: null, year: 1 });
        expect((await getCached('keep')).stats).toBe('kept');
    });
});
