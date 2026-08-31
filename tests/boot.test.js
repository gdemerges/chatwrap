/**
 * Boot the real page.
 *
 * `app.js` runs a lot of work at module scope — locale, theme, static
 * translation, event wiring — against elements it looks up by id. A renamed id
 * or a missing element throws before anything is painted, and no unit test of
 * a single module would notice. So this loads `index.html` for real and
 * imports the module on top of it.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dirname, '..', 'index.html'), 'utf-8');

const errors = [];

beforeAll(async () => {
    // Only the <body> — jsdom already gave us a document, and the CSP meta tag
    // in <head> is not something jsdom needs to re-parse.
    document.body.innerHTML = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
    document.documentElement.lang = 'fr';

    // jsdom reports en-US; pin the browser language so the assertions below
    // are about the wiring rather than about the machine running the tests.
    Object.defineProperty(window.navigator, 'languages', { value: ['fr-FR', 'fr'], configurable: true });
    Object.defineProperty(window.navigator, 'language', { value: 'fr-FR', configurable: true });

    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    window.HTMLCanvasElement.prototype.getContext = vi.fn(() => ({}));
    // The worker is only constructed once a file is loaded, but stub it so a
    // failure to boot is never mistaken for a missing Worker implementation.
    window.Worker = class { postMessage() {} addEventListener() {} removeEventListener() {} };

    vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(args.join(' ')));
    window.addEventListener('error', (e) => errors.push(String(e.error || e.message)));

    await import('../js/app.js');
});

describe('app boot', () => {
    it('starts without throwing or logging an error', () => {
        expect(errors).toEqual([]);
    });

    it('translates the page it was handed', () => {
        expect(document.querySelector('.upload-subtitle').textContent)
            .toBe('Les stats cachées de tes conversations WhatsApp');
        expect(document.querySelector('#drop-zone').getAttribute('aria-label'))
            .toBe('Déposer un fichier WhatsApp exporté');
    });

    it('fills the language picker from the registered locales', async () => {
        // Read from `LOCALES` rather than a hard-coded pair: the point of the
        // picker is that registering a dictionary is enough to make it appear,
        // and a literal list here would fail every time that happens.
        const { LOCALES } = await import('../js/i18n.js');
        const options = [...document.querySelectorAll('#lang-select option')];
        expect(options.map(o => o.value).sort()).toEqual(Object.keys(LOCALES).sort());
        expect(options.length).toBeGreaterThan(1);
        expect(document.querySelector('#lang-select').value).toBe('fr');
    });

    it('labels the theme toggle for the current theme', () => {
        const btn = document.querySelector('#theme-toggle');
        expect(btn.getAttribute('aria-label')).toBe('Passer en mode clair');
    });

    it('shows the upload screen and nothing else', () => {
        expect(document.querySelector('#upload-screen').classList.contains('active')).toBe(true);
        expect(document.querySelector('#wrapped-screen').classList.contains('active')).toBe(false);
    });

    it('keeps the period button hidden until a file is loaded', () => {
        expect(document.querySelector('#period-btn').hidden).toBe(true);
    });

    it('keeps the pin button hidden until there is something to pin', () => {
        expect(document.querySelector('#pin-btn').hidden).toBe(true);
    });

    it('offers a way out of a long analysis', () => {
        // The loading screen used to be a dead end: no cancel, and the AI
        // option can sit there downloading ~50 MB.
        expect(document.querySelector('#loading-cancel')).not.toBeNull();
        expect(document.querySelector('#loading-cancel').textContent).toBe('Annuler');
    });

    it('shows what a deck looks like before asking for a file', () => {
        const peek = document.querySelector('#demo-peek');
        expect(peek).not.toBeNull();
        expect(peek.getAttribute('aria-label')).toBe('Voir un exemple de rétrospective');
        expect(peek.querySelectorAll('.peek-card')).toHaveLength(3);
    });

    it('states the privacy position, and says nothing about a counter that is off', () => {
        const note = document.querySelector('.privacy-note').textContent;
        expect(note).toContain('restent sur ton appareil');
        expect(note).not.toContain('compteur');
    });

    it('picked its language from the browser', async () => {
        const { getLocale } = await import('../js/i18n.js');
        expect(getLocale()).toBe('fr');
    });

    it('walks the browser language list until it finds one it speaks', async () => {
        const { initLocale, getLocale, setLocale, LOCALES } = await import('../js/i18n.js');
        window.localStorage.removeItem('ww-locale');

        // Japanese has no dictionary, so the second choice wins. Deliberately
        // *not* a language listed in LOCALES — this test is about the fallback
        // walk, and picking a translated first entry would test nothing.
        expect(Object.keys(LOCALES)).not.toContain('ja');
        Object.defineProperty(window.navigator, 'languages', { value: ['ja-JP', 'en-GB'], configurable: true });
        expect(initLocale()).toBe('en');
        expect(getLocale()).toBe('en');

        // And a first choice it does speak is taken as is.
        Object.defineProperty(window.navigator, 'languages', { value: ['de-DE', 'en-GB'], configurable: true });
        expect(initLocale()).toBe('de');

        Object.defineProperty(window.navigator, 'languages', { value: ['fr-FR'], configurable: true });
        expect(initLocale()).toBe('fr');
        setLocale('fr');
    });

    it('retranslates the whole page when the language changes', async () => {
        const { setLocale } = await import('../js/i18n.js');
        setLocale('en');

        expect(document.documentElement.lang).toBe('en');
        expect(document.querySelector('.upload-subtitle').textContent)
            .toBe('The hidden stats of your WhatsApp conversations');
        expect(document.querySelector('#theme-toggle').getAttribute('aria-label'))
            .toBe('Switch to light mode');
        expect(document.querySelector('.privacy-note').textContent)
            .toContain('stays on your device');
        expect(document.querySelector('#lang-select').value).toBe('en');
        expect(errors).toEqual([]);

        setLocale('fr');
    });
});
