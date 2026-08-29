/**
 * IndexedDB-backed cache for parsed+computed stats.
 * Keyed by a hash of the input file so re-loading the same export
 * skips parse / compute / ML sentiment entirely.
 */

const DB_NAME = 'wa-wrapped';
const STORE = 'stats';
// v3: cache keys moved into the worker and now encode the date range and
// the AI-sentiment toggle — old keys are meaningless, drop them.
// v4: notable days now carry the context that explains them; entries computed
// before that hold a sentiment payload without it and would silently serve a
// dateless verdict forever.
const DB_VERSION = 4;
const TTL_DAYS = 14;

/** Opens (and migrates) the database. */
function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            // Recreate the store on any version bump so stale (pre-fix)
            // stats are recomputed rather than served from cache.
            if (db.objectStoreNames.contains(STORE)) db.deleteObjectStore(STORE);
            db.createObjectStore(STORE, { keyPath: 'key' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

/**
 * Past this many characters, a file is fingerprinted by its head, its tail and
 * its length rather than in full — hashing 50 MB to decide whether to reuse a
 * cache entry costs more than recomputing the stats.
 */
const FULL_HASH_LIMIT = 1_000_000;
const EDGE = 100_000;

async function sha1(input) {
    const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(input));
    return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Incremental counterpart of `hashText`, for a file read as a stream.
 *
 * It holds at most `FULL_HASH_LIMIT` characters: once the file is bigger than
 * that, only the first and last `EDGE` characters are kept and the rest is
 * counted and dropped. Same inputs, same digest as `hashText` — a file already
 * in the cache still hits it.
 *
 * @returns {{ push: (chunk: string) => void, digest: () => Promise<string> }}
 */
export function createHasher() {
    let whole = '';
    let head = '';
    let tail = '';
    let length = 0;
    let overflowed = false;

    return {
        push(chunk) {
            length += chunk.length;
            if (!overflowed) {
                whole += chunk;
                if (whole.length <= FULL_HASH_LIMIT) return;
                overflowed = true;
                head = whole.slice(0, EDGE);
                tail = whole.slice(-EDGE);
                whole = '';
                return;
            }
            tail = (tail + chunk).slice(-EDGE);
        },
        digest() {
            return overflowed
                ? sha1(head + '|' + length + '|' + tail)
                : sha1(whole);
        },
    };
}

/** Quick non-cryptographic hash — good enough for cache keys. */
export async function hashText(text) {
    return sha1(text.length > FULL_HASH_LIMIT
        ? text.slice(0, EDGE) + '|' + text.length + '|' + text.slice(-EDGE)
        : text);
}

/**
 * Look up cached stats by hash. Returns null on miss / error / expiry.
 * @param {string} key
 * @returns {Promise<{stats: any, comparison: any, year: any, savedAt: number} | null>}
 */
export async function getCached(key) {
    try {
        const db = await openDB();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readonly');
            const req = tx.objectStore(STORE).get(key);
            req.onsuccess = () => {
                const v = req.result;
                if (!v) return resolve(null);
                const ageMs = Date.now() - v.savedAt;
                if (ageMs > TTL_DAYS * 86400_000) return resolve(null);
                resolve(v);
            };
            req.onerror = () => reject(req.error);
        });
    } catch (err) {
        console.warn('[cache] read failed:', err);
        return null;
    }
}

/**
 * @param {string} key
 * @param {{stats: any, comparison: any, year: any}} payload
 */
export async function setCached(key, payload) {
    try {
        const db = await openDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put({ key, ...payload, savedAt: Date.now() });
            tx.oncomplete = () => resolve(undefined);
            tx.onerror = () => reject(tx.error);
        });
    } catch (err) {
        console.warn('[cache] write failed:', err);
    }
}

/** Drop all cached entries. */
export async function clearCache() {
    try {
        const db = await openDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).clear();
            tx.oncomplete = () => resolve(undefined);
            tx.onerror = () => reject(tx.error);
        });
    } catch (err) {
        console.warn('[cache] clear failed:', err);
    }
}
