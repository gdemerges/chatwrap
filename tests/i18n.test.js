/**
 * The dictionaries have to stay in step.
 *
 * A missing key silently falls back to French, which reads as a bug rather
 * than a translation gap; a dropped `{param}` leaves a number out of a
 * sentence. Both are invisible until someone switches language, so they are
 * checked here instead.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { LOCALES, FALLBACK, t, tList, setLocale, getLocale, intlLocale } from '../js/i18n.js';

/** Every leaf path of a dictionary, as dotted keys. Arrays count as leaves. */
function paths(node, prefix = '') {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) return [prefix];
    return Object.entries(node).flatMap(([k, v]) => paths(v, prefix ? `${prefix}.${k}` : k));
}

function leaf(dict, path) {
    return path.split('.').reduce((n, k) => (n == null ? n : n[k]), dict);
}

const params = (value) => new Set(String(value).match(/\{(\w+)\}/g) || []);

const reference = LOCALES[FALLBACK].dict;
const referencePaths = paths(reference);
const others = Object.values(LOCALES).filter(l => l.code !== FALLBACK);

describe('i18n dictionaries', () => {
    it('has a non-trivial reference dictionary', () => {
        expect(referencePaths.length).toBeGreaterThan(200);
    });

    for (const locale of others) {
        describe(locale.code, () => {
            const own = paths(locale.dict);

            it('covers exactly the reference keys', () => {
                expect([...own].sort()).toEqual([...referencePaths].sort());
            });

            it('keeps every interpolated parameter', () => {
                for (const path of referencePaths) {
                    const src = leaf(reference, path);
                    const dst = leaf(locale.dict, path);
                    if (typeof src !== 'string' || typeof dst !== 'string') continue;
                    expect({ path, params: [...params(dst)].sort() })
                        .toEqual({ path, params: [...params(src)].sort() });
                }
            });

            it('translates something, rather than copying the French', () => {
                const identical = referencePaths.filter((path) => {
                    const src = leaf(reference, path);
                    const dst = leaf(locale.dict, path);
                    return typeof src === 'string' && src === dst && /\p{L}{4}/u.test(src);
                });
                // Proper nouns and shared words ("Dashboard", "Stickers") are
                // legitimately identical; a wholesale copy is not.
                expect(identical.length).toBeLessThan(referencePaths.length * 0.15);
            });

            it('names the seven weekdays', () => {
                expect(locale.dict.days).toHaveLength(7);
            });
        });
    }
});

describe('t()', () => {
    beforeEach(() => { setLocale(FALLBACK); });

    it('interpolates named parameters', () => {
        expect(t('deck.slideLabel', { n: 3, total: 12 })).toContain('3');
        expect(t('deck.slideLabel', { n: 3, total: 12 })).toContain('12');
    });

    it('leaves an unknown placeholder alone rather than printing "undefined"', () => {
        expect(t('deck.slideLabel', { n: 3 })).toContain('{total}');
    });

    it('returns the key itself when nothing matches', () => {
        expect(t('nope.not.here')).toBe('nope.not.here');
    });

    it('switches language, and reports it', () => {
        expect(setLocale('en')).toBe(true);
        expect(getLocale()).toBe('en');
        expect(intlLocale()).toBe('en');
        expect(t('common.close')).toBe('Close');
    });

    it('ignores an unknown locale and a no-op change', () => {
        expect(setLocale('kl')).toBe(false);
        expect(getLocale()).toBe(FALLBACK);
        expect(setLocale('en')).toBe(true);
        expect(setLocale('en')).toBe(false);
    });

    it('falls back to French for a key a translation is missing', () => {
        const original = LOCALES.en.dict.common.close;
        delete LOCALES.en.dict.common.close;
        setLocale('en');
        expect(t('common.close')).toBe(LOCALES.fr.dict.common.close);
        LOCALES.en.dict.common.close = original;
    });

    it('exposes list entries through tList', () => {
        setLocale('en');
        expect(tList('days')[0]).toBe('Monday');
        expect(tList('common.close')).toEqual([]);
    });
});


/**
 * Every `t('...')` in the source, resolved.
 *
 * A key is a string literal, so a typo survives lint, types and any test that
 * does not happen to render that exact element — it just prints
 * `slide.moods.title` on the slide. Scanning the source closes that gap for
 * the literal keys, which is nearly all of them.
 */
describe('translation keys used in the source', () => {
    const jsDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'js');

    const walk = (dir) => readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        return statSync(full).isDirectory() ? walk(full)
            : full.endsWith('.js') ? [full] : [];
    });

    const files = walk(jsDir).filter(f => !f.includes(`${'lang'}/ui/`));
    const used = new Map();
    for (const file of files) {
        const source = readFileSync(file, 'utf-8');
        for (const [, key] of source.matchAll(/\bt\(\s*'([a-zA-Z][\w.]*\.[\w.]+)'/g)) {
            if (!used.has(key)) used.set(key, file);
        }
    }

    it('finds the keys in the first place', () => {
        expect(used.size).toBeGreaterThan(100);
    });

    it.each(Object.keys(LOCALES))('resolves every one of them in %s', (locale) => {
        setLocale(locale);
        const missing = [...used].filter(([key]) => t(key) === key)
            .map(([key, file]) => `${key} (${file.slice(jsDir.length + 1)})`);
        expect(missing).toEqual([]);
    });
});

/**
 * The worker must not word anything: it posts a key, the page translates it.
 * A code added on one side and forgotten on the other used to surface as a
 * raw `loading.somethingNew` on the loading screen.
 */
describe('worker progress codes', () => {
    const sources = [
        'js/worker.js',
        'js/worker/sentiment-ml.js',
        'js/worker/sentiment-aggregates.js',
        'js/worker/day-context.js',
    ];

    const emitted = [...new Set(sources.flatMap((path) => {
        const src = readFileSync(path, 'utf8');
        return [...src.matchAll(/\b(?:progress|onProgress)\(\s*'([a-zA-Z]+)'/g)].map(m => m[1]);
    }))];

    it('emits at least the steps the loading screen knows about', () => {
        expect(emitted.length).toBeGreaterThan(3);
    });

    it.each(emitted)('has a `loading.%s` entry in every dictionary', (code) => {
        for (const locale of Object.keys(LOCALES)) {
            setLocale(locale);
            expect(t(`loading.${code}`)).not.toBe(`loading.${code}`);
        }
    });

    it('never posts a whole sentence', () => {
        for (const path of sources) {
            const src = readFileSync(path, 'utf8');
            const sentences = [...src.matchAll(/\b(?:progress|onProgress)\(\s*[`'"]([^`'"]*\s[^`'"]*)[`'"]/g)];
            expect(sentences.map(m => `${path}: ${m[1]}`)).toEqual([]);
        }
    });
});
