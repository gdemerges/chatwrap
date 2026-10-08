/**
 * File intake, without the screens: size and extension checks, and unzipping
 * a WhatsApp .zip export down to its chat file.
 *
 * Lives apart from app.js because app.js runs its whole UI at module scope
 * (DOM lookups, listeners), which makes anything inside it untestable. Nothing
 * here touches the DOM or the language: errors come out as a `code` plus
 * `params`, and app.js turns them into a sentence with `t()`.
 */

import { ensureJSZip } from './vendor.js';
import { pickChatEntry } from './utils.js';

/**
 * The worker keeps every parsed message, and that costs about six times the
 * text: a 50 MB export holds ~300 MB of heap once parsed, ~360 MB at the peak
 * (measured on a synthetic 725 000-message chat). That is already near what a
 * phone tab survives, so touch devices keep the old cap; a desktop browser has
 * room for three times as much, which covers multi-year group chats.
 *
 * @param {Window & typeof globalThis} [win=window]
 * @returns {number} the cap in bytes
 */
export function maxFileSize(win = window) {
    const coarse = win.matchMedia?.('(pointer: coarse)').matches;
    return (coarse ? 50 : 150) * 1024 * 1024;
}

/** @param {number} bytes */
const toMb = (bytes) => Math.round(bytes / 1024 / 1024);

/**
 * Check a picked file before reading it.
 *
 * @param {{ size: number, name: string }} file
 * @param {number} maxSize in bytes
 * @returns {null | { key: string, params?: Record<string, unknown> }}
 *   `null` when the file is acceptable, otherwise the translation key to show.
 */
export function validateFile(file, maxSize) {
    if (file.size > maxSize) return { key: 'error.tooBig', params: { mb: toMb(maxSize) } };
    if (!/\.(txt|zip)$/i.test(file.name)) return { key: 'error.badExt' };
    return null;
}

/** @param {string} name */
export function isZip(name) {
    return name.toLowerCase().endsWith('.zip');
}

/**
 * Extract the chat file from a zip export.
 *
 * Throws errors carrying `code` (`noTxtInZip`, `unzippedTooBig`) and, for the
 * size one, `params: { mb }`. A vendor load failure passes through unchanged.
 *
 * @param {Blob | File} file
 * @param {{ maxSize: number, onProgress?: (pct: number) => void }} options
 * @returns {Promise<Blob>}
 */
export async function unzip(file, { maxSize, onProgress } = { maxSize: Infinity }) {
    await ensureJSZip();
    const zip = await window.JSZip.loadAsync(file);
    const entry = pickChatEntry(Object.values(zip.files));
    if (!entry) throw Object.assign(new Error('noTxtInZip'), { code: 'noTxtInZip' });

    const tooBig = () => Object.assign(new Error('unzippedTooBig'), {
        code: 'unzippedTooBig',
        params: { mb: toMb(maxSize) },
    });

    // The size cap applies to the *compressed* file; a small zip can inflate
    // to gigabytes. Check the declared size first, then the real one.
    const declared = entry._data?.uncompressedSize;
    if (typeof declared === 'number' && declared > maxSize) throw tooBig();

    const blob = await entry.async('blob', (meta) => {
        onProgress?.(Math.round(meta.percent));
    });
    if (blob.size > maxSize) throw tooBig();
    return blob;
}

// Duplicated in sw.js, which is not a module and cannot import this file.
// tests/sw.test.js fails if the two copies drift apart.
export const SHARE_CACHE = 'ww-share-inbox';
export const SHARE_KEY = 'share-inbox/latest';

/**
 * Take the file the service worker parked for a share, and empty the slot.
 *
 * Read once and deleted: an export is personal and should not sit on the disk
 * after it has been analysed. Any failure (no Cache API, no entry, a corrupt
 * header) comes back as `null`, and the caller says the file was not received.
 *
 * @param {CacheStorage | undefined} [cacheStorage=globalThis.caches]
 * @returns {Promise<File | null>}
 */
export async function takeSharedFile(cacheStorage = globalThis.caches) {
    try {
        if (!cacheStorage) return null;
        const cache = await cacheStorage.open(SHARE_CACHE);
        const response = await cache.match(SHARE_KEY);
        if (!response) return null;
        const bytes = await response.arrayBuffer();
        await cache.delete(SHARE_KEY);
        return new File([bytes], decodeName(response.headers.get('X-Filename')), {
            type: response.headers.get('Content-Type') || '',
        });
    } catch {
        return null;
    }
}

/** @param {string | null} raw the percent-encoded header value */
function decodeName(raw) {
    if (!raw) return '';
    try {
        return decodeURIComponent(raw);
    } catch {
        return '';
    }
}

const EXT_BY_TYPE = {
    'text/plain': '.txt',
    'application/zip': '.zip',
    'application/x-zip-compressed': '.zip',
};

/**
 * Give a file the extension its type implies, when its name has none.
 *
 * Some share sheets hand over `chat` or `Discussion WhatsApp` with no
 * extension, and `validateFile` would refuse it. The name is only trusted for
 * the extension when it already has a supported one; otherwise the MIME type
 * decides. A file that is neither is returned untouched and fails validation
 * as before.
 *
 * @param {File} file
 * @returns {File}
 */
export function normalizeName(file) {
    if (/\.(txt|zip)$/i.test(file.name)) return file;
    const type = (file.type || '').split(';')[0].trim().toLowerCase();
    const ext = EXT_BY_TYPE[type];
    if (!ext) return file;
    return new File([file], `${file.name || 'chat'}${ext}`, { type: file.type });
}

/**
 * Call `callback` with the file the OS hands over when the app is opened from
 * a file (desktop "Open with" for a PWA with `file_handlers`). Does nothing
 * where the Launch Queue API is missing.
 *
 * @param {Window & typeof globalThis} [win=window]
 * @param {(file: File) => void} callback
 */
export function onLaunchFiles(win = window, callback) {
    if (!win.launchQueue) return;
    win.launchQueue.setConsumer(async (params) => {
        const handle = params.files?.[0];
        if (!handle) return;
        callback(await handle.getFile());
    });
}
