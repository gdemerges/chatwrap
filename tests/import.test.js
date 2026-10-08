// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../js/vendor.js', () => ({ ensureJSZip: vi.fn(() => Promise.resolve()) }));

import {
    maxFileSize, validateFile, isZip, unzip,
    takeSharedFile, normalizeName, onLaunchFiles, SHARE_CACHE, SHARE_KEY,
} from '../js/import.js';

const MB = 1024 * 1024;

/** A fake JSZip entry: `size` is what the zip declares, `real` what inflates. */
function entry(name, { size = 10, real = size, percent = [] } = {}) {
    return {
        name,
        dir: false,
        _data: { uncompressedSize: size },
        async: vi.fn(async (_type, onUpdate) => {
            for (const p of percent) onUpdate({ percent: p });
            return new Blob(['x'.repeat(real)]);
        }),
    };
}

function fakeZip(entries) {
    const files = Object.fromEntries(entries.map((e) => [e.name, e]));
    return { files };
}

describe('maxFileSize', () => {
    it('gives a coarse pointer (touch) the 50 MB cap', () => {
        const win = { matchMedia: () => ({ matches: true }) };
        expect(maxFileSize(win)).toBe(50 * MB);
    });

    it('gives a fine pointer (desktop) the 150 MB cap', () => {
        const win = { matchMedia: () => ({ matches: false }) };
        expect(maxFileSize(win)).toBe(150 * MB);
    });

    it('falls back to the desktop cap when matchMedia is absent', () => {
        expect(maxFileSize({})).toBe(150 * MB);
    });

    it('queries the coarse pointer media feature', () => {
        const matchMedia = vi.fn(() => ({ matches: false }));
        maxFileSize({ matchMedia });
        expect(matchMedia).toHaveBeenCalledWith('(pointer: coarse)');
    });
});

describe('validateFile', () => {
    const max = 10 * MB;

    it('rejects a file over the cap, with the cap in MB', () => {
        expect(validateFile({ size: max + 1, name: 'chat.txt' }, max))
            .toEqual({ key: 'error.tooBig', params: { mb: 10 } });
    });

    it('rejects an unsupported extension', () => {
        expect(validateFile({ size: 1, name: 'photo.jpg' }, max)).toEqual({ key: 'error.badExt' });
    });

    it('accepts .ZIP in upper case', () => {
        expect(validateFile({ size: 1, name: 'EXPORT.ZIP' }, max)).toBeNull();
    });

    it('accepts a .txt file within the cap', () => {
        expect(validateFile({ size: max, name: 'chat.txt' }, max)).toBeNull();
    });

    it('checks the size before the extension', () => {
        expect(validateFile({ size: max + 1, name: 'x.jpg' }, max).key).toBe('error.tooBig');
    });
});

describe('isZip', () => {
    it('recognises .zip regardless of case', () => {
        expect(isZip('Export.ZIP')).toBe(true);
        expect(isZip('export.zip')).toBe(true);
    });

    it('is false for a .txt file', () => {
        expect(isZip('chat.txt')).toBe(false);
    });
});

describe('unzip', () => {
    beforeEach(() => {
        window.JSZip = { loadAsync: vi.fn() };
    });
    afterEach(() => {
        delete window.JSZip;
    });

    it('fails with noTxtInZip when the archive holds no .txt', async () => {
        window.JSZip.loadAsync.mockResolvedValue(fakeZip([entry('photo.jpg')]));
        await expect(unzip(new Blob(), { maxSize: MB })).rejects.toMatchObject({ code: 'noTxtInZip' });
    });

    it('fails with unzippedTooBig when the declared size is over the cap', async () => {
        window.JSZip.loadAsync.mockResolvedValue(fakeZip([entry('_chat.txt', { size: 2 * MB })]));
        const err = await unzip(new Blob(), { maxSize: MB }).catch((e) => e);
        expect(err.code).toBe('unzippedTooBig');
        expect(err.params).toEqual({ mb: 1 });
    });

    it('fails with unzippedTooBig when the real size is over the cap', async () => {
        // Declared size looks harmless; the inflated blob is what counts.
        window.JSZip.loadAsync.mockResolvedValue(fakeZip([entry('_chat.txt', { size: 10, real: 2 * MB })]));
        const err = await unzip(new Blob(), { maxSize: MB }).catch((e) => e);
        expect(err.code).toBe('unzippedTooBig');
        expect(err.params).toEqual({ mb: 1 });
    });

    it('relays rounded progress through onProgress', async () => {
        window.JSZip.loadAsync.mockResolvedValue(fakeZip([entry('_chat.txt', { percent: [12.4, 50.6, 100] })]));
        const onProgress = vi.fn();
        await unzip(new Blob(), { maxSize: MB, onProgress });
        expect(onProgress.mock.calls.map((c) => c[0])).toEqual([12, 51, 100]);
    });

    it('returns the chat entry as a blob on success', async () => {
        window.JSZip.loadAsync.mockResolvedValue(fakeZip([
            entry('readme.txt', { size: 5 }),
            entry('_chat.txt', { size: 20, real: 20 }),
        ]));
        const blob = await unzip(new Blob(), { maxSize: MB });
        expect(blob).toBeInstanceOf(Blob);
        expect(blob.size).toBe(20);
    });

    it('loads JSZip through ensureJSZip before reading', async () => {
        const { ensureJSZip } = await import('../js/vendor.js');
        window.JSZip.loadAsync.mockResolvedValue(fakeZip([entry('_chat.txt')]));
        await unzip(new Blob(), { maxSize: MB });
        expect(ensureJSZip).toHaveBeenCalled();
    });
});

/* global Response */
/** An in-memory stand-in for CacheStorage, holding real Response objects. */
function fakeCacheStorage(entries = {}) {
    const store = new Map(Object.entries(entries));
    const cache = {
        match: vi.fn(async (key) => store.get(key)?.clone()),
        delete: vi.fn(async (key) => store.delete(key)),
    };
    return { store, cache, open: vi.fn(async () => cache) };
}

/** What sw.js parks for a share: the file body plus its two headers. */
function parked(text, { type = 'text/plain', name = '' } = {}) {
    return new Response(text, {
        headers: { 'Content-Type': type, 'X-Filename': encodeURIComponent(name) },
    });
}

describe('takeSharedFile', () => {
    it('returns the parked export as a File, with its decoded name', async () => {
        const storage = fakeCacheStorage({ [SHARE_KEY]: parked('hello', { name: 'Discussion avec Zoé 2024.txt' }) });
        const file = await takeSharedFile(storage);
        expect(file).toBeInstanceOf(File);
        expect(file.name).toBe('Discussion avec Zoé 2024.txt');
        expect(file.type).toBe('text/plain');
        expect(await file.text()).toBe('hello');
    });

    it('deletes the entry once it has been read', async () => {
        const storage = fakeCacheStorage({ [SHARE_KEY]: parked('x', { name: 'a.txt' }) });
        await takeSharedFile(storage);
        expect(storage.open).toHaveBeenCalledWith(SHARE_CACHE);
        expect(storage.cache.delete).toHaveBeenCalledWith(SHARE_KEY);
        expect(storage.store.has(SHARE_KEY)).toBe(false);
    });

    it('returns null, and deletes nothing, when the inbox is empty', async () => {
        const storage = fakeCacheStorage();
        expect(await takeSharedFile(storage)).toBeNull();
        expect(storage.cache.delete).not.toHaveBeenCalled();
    });

    it('returns null when there is no Cache API at all', async () => {
        expect(await takeSharedFile(null)).toBeNull();
        expect(await takeSharedFile(undefined)).toBeNull();
    });

    it('returns null when opening the cache fails', async () => {
        const storage = { open: vi.fn(async () => { throw new Error('quota'); }) };
        expect(await takeSharedFile(storage)).toBeNull();
    });

    it('keeps a name with spaces and accents intact', async () => {
        const name = 'Chat de l’équipe (2024) n°2.txt';
        const storage = fakeCacheStorage({ [SHARE_KEY]: parked('x', { name }) });
        expect((await takeSharedFile(storage)).name).toBe(name);
    });

    it('falls back to an empty name when the header is malformed', async () => {
        const bare = new Response('x', { headers: { 'Content-Type': 'text/plain', 'X-Filename': '%E0%A4%A' } });
        const storage = fakeCacheStorage({ [SHARE_KEY]: bare });
        expect((await takeSharedFile(storage)).name).toBe('');
    });
});

describe('normalizeName', () => {
    const f = (name, type = '') => new File(['x'], name, { type });

    it('keeps a name that already has .txt, whatever the type says', () => {
        const file = f('chat.txt', 'application/zip');
        expect(normalizeName(file)).toBe(file);
    });

    it('keeps a .ZIP name in upper case', () => {
        const file = f('EXPORT.ZIP', 'text/plain');
        expect(normalizeName(file)).toBe(file);
    });

    it('adds .txt to a name without extension when the type is text/plain', () => {
        const out = normalizeName(f('chat', 'text/plain'));
        expect(out.name).toBe('chat.txt');
        expect(out.type).toBe('text/plain');
    });

    it('adds .zip for application/zip', () => {
        expect(normalizeName(f('Discussion', 'application/zip')).name).toBe('Discussion.zip');
    });

    it('adds .zip for the Windows MIME type application/x-zip-compressed', () => {
        expect(normalizeName(f('export', 'application/x-zip-compressed')).name).toBe('export.zip');
    });

    it('ignores parameters on the type', () => {
        expect(normalizeName(f('chat', 'text/plain; charset=utf-8')).name).toBe('chat.txt');
    });

    it('returns the file untouched when neither name nor type is recognised', () => {
        const file = f('photo', 'image/jpeg');
        expect(normalizeName(file)).toBe(file);
    });

    it('returns the file untouched when the type is empty and the name has no extension', () => {
        const file = f('chat', '');
        expect(normalizeName(file)).toBe(file);
    });

    it('keeps the bytes of the file it renames', async () => {
        const out = normalizeName(f('chat', 'text/plain'));
        expect(await out.text()).toBe('x');
    });

    it('lets validateFile accept a renamed share', () => {
        const out = normalizeName(f('Discussion', 'text/plain'));
        expect(validateFile(out, 1024)).toBeNull();
    });
});

describe('onLaunchFiles', () => {
    it('does nothing where the Launch Queue API is missing', () => {
        const callback = vi.fn();
        expect(() => onLaunchFiles({}, callback)).not.toThrow();
        expect(callback).not.toHaveBeenCalled();
    });

    it('registers a consumer on window.launchQueue', () => {
        const win = { launchQueue: { setConsumer: vi.fn() } };
        onLaunchFiles(win, () => {});
        expect(win.launchQueue.setConsumer).toHaveBeenCalledTimes(1);
    });

    it('hands the first launched file to the callback', async () => {
        const file = new File(['abc'], 'chat.txt', { type: 'text/plain' });
        const win = { launchQueue: { setConsumer: vi.fn() } };
        const callback = vi.fn();
        onLaunchFiles(win, callback);

        const consumer = win.launchQueue.setConsumer.mock.calls[0][0];
        const handles = [{ getFile: vi.fn(async () => file) }, { getFile: vi.fn() }];
        await consumer({ files: handles });

        expect(handles[0].getFile).toHaveBeenCalledTimes(1);
        expect(handles[1].getFile).not.toHaveBeenCalled();
        expect(callback).toHaveBeenCalledWith(file);
    });

    it('ignores a launch that carries no files', async () => {
        const win = { launchQueue: { setConsumer: vi.fn() } };
        const callback = vi.fn();
        onLaunchFiles(win, callback);

        const consumer = win.launchQueue.setConsumer.mock.calls[0][0];
        await consumer({ files: [] });
        await consumer({});
        expect(callback).not.toHaveBeenCalled();
    });
});
