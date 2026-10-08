/**
 * @vitest-environment node
 *
 * The web app manifest is static JSON, so nothing else checks it. These tests
 * pin the things a broken manifest breaks silently: invalid JSON, a product
 * name that drifted back to a third-party brand, a localized description that
 * no longer matches the UI languages, and icons that 404 on install.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const raw = readFileSync(resolve(ROOT, 'manifest.json'), 'utf8');

describe('manifest.json', () => {
    it('is valid JSON', () => {
        expect(() => JSON.parse(raw)).not.toThrow();
    });

    const manifest = JSON.parse(raw);

    it('does not put "WhatsApp" in name or short_name', () => {
        expect(manifest.name).not.toMatch(/whatsapp/i);
        expect(manifest.short_name).not.toMatch(/whatsapp/i);
    });

    it('defaults to English', () => {
        expect(manifest.lang).toBe('en');
        expect(manifest.dir).toBe('ltr');
    });

    it('localizes description for exactly the UI languages other than English', () => {
        const uiDir = resolve(ROOT, 'js/lang/ui');
        const uiLangs = readdirSync(uiDir)
            .filter((f) => f.endsWith('.js'))
            .map((f) => f.replace(/\.js$/, ''))
            .filter((l) => l !== 'en')
            .sort();
        const localized = Object.keys(manifest.description_localized ?? {}).sort();
        expect(localized).toEqual(uiLangs);
    });

    it('has a non-empty string for every localized description', () => {
        for (const [lang, text] of Object.entries(manifest.description_localized ?? {})) {
            expect(typeof text, lang).toBe('string');
            expect(text.trim().length, lang).toBeGreaterThan(0);
        }
    });

    it('references only icons that exist on disk', () => {
        expect(Array.isArray(manifest.icons)).toBe(true);
        for (const icon of manifest.icons) {
            expect(existsSync(resolve(ROOT, icon.src)), icon.src).toBe(true);
        }
    });
});

const manifest = JSON.parse(raw);

describe('share target and file handlers', () => {
    const swSource = readFileSync(resolve(ROOT, 'sw.js'), 'utf8');
    const target = manifest.share_target;
    const fileParams = target?.params?.files?.[0];

    it('posts shares as multipart to a relative action inside the scope', () => {
        expect(target.method).toBe('POST');
        expect(target.enctype).toBe('multipart/form-data');
        expect(target.action.startsWith('/')).toBe(false);
        expect(target.action).toBe('share-target');
        // The service worker recognises the POST by this suffix.
        expect(swSource).toContain("endsWith('/share-target')");
        const base = new URL('https://chatwrap.test/');
        const scope = new URL(manifest.scope, base).pathname;
        expect(new URL(target.action, base).pathname.startsWith(scope)).toBe(true);
    });

    it('accepts both .txt and .zip exports, by MIME type and by extension', () => {
        expect(fileParams.name).toBe('chat');
        expect(fileParams.accept).toEqual(expect.arrayContaining(['text/plain', '.txt', 'application/zip', '.zip']));
    });

    it('opens .txt and .zip files from the desktop with the app page', () => {
        const handler = manifest.file_handlers.find((h) => h.action === 'index.html');
        expect(handler).toBeDefined();
        expect(handler.accept['text/plain']).toContain('.txt');
        expect(handler.accept['application/zip']).toContain('.zip');
        expect(existsSync(resolve(ROOT, handler.action))).toBe(true);
    });

    it('reuses a focused window instead of opening a second one', () => {
        expect(manifest.launch_handler.client_mode).toBe('focus-existing');
    });
});
