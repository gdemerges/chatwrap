import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parse } from '../js/parser.js';
import { compute } from '../js/stats.js';
import { serializeStats, rehydrateDates, sanitizeShared, buildShareURL } from '../js/payload.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(resolve(__dirname, 'fixtures', name), 'utf-8');

describe('payload privacy', () => {
    const messages = parse(fixture('ios_fr.txt'));
    const stats = compute(messages);

    it('never serializes raw message bodies', () => {
        const json = JSON.stringify(serializeStats(stats));
        // Distinctive substrings from the fixture's message bodies must not leak.
        expect(json).not.toContain('aide hier');
        expect(json).not.toContain('regardez ce lien');
    });

    it('serializeStats does not mutate the original stats object', () => {
        const before = stats.startDate;
        serializeStats(stats);
        expect(stats.startDate).toBe(before);
        expect(stats.startDate).toBeInstanceOf(Date);
    });
});

describe('sanitizeShared', () => {
    it('strips markup from strings, including nested values and keys', () => {
        const dirty = {
            avgPerDay: '<img src=x onerror=alert(1)>',
            streak: { max: '12"><b>pwn</b>' },
            perPerson: { '<i>Eve</i>': { count: 3 } },
            ranking: [['Alice', { percent: '<script>1</script>' }]],
        };
        const clean = sanitizeShared(dirty);
        const json = JSON.stringify(clean);
        expect(json).not.toContain('<');
        expect(json).not.toContain('>');
        expect(json).not.toContain('\\"><');
        expect(clean.perPerson['iEve/i'].count).toBe(3);
    });

    it('leaves numbers, booleans and null untouched', () => {
        const input = { a: 42, b: true, c: null, d: [1, 2.5], e: 'Léo & Zoé' };
        expect(sanitizeShared(input)).toEqual(input);
    });
});

describe('payload date round-trip', () => {
    const messages = parse(fixture('ios_fr.txt'));
    const stats = compute(messages);

    it('round-trips dates through serialize → rehydrate', () => {
        const restored = rehydrateDates(serializeStats(stats));
        expect(restored.startDate).toBeInstanceOf(Date);
        expect(restored.endDate).toBeInstanceOf(Date);
        expect(restored.startDate.getTime()).toBe(stats.startDate.getTime());
        expect(restored.endDate.getTime()).toBe(stats.endDate.getTime());
    });

    it('round-trips firstMessage datetime', () => {
        const restored = rehydrateDates(serializeStats(stats));
        if (stats.firstMessage?.datetime) {
            expect(restored.firstMessage.datetime).toBeInstanceOf(Date);
            expect(restored.firstMessage.datetime.getTime())
                .toBe(stats.firstMessage.datetime.getTime());
        }
    });
});

describe('sanitizeShared on malformed shared payloads', () => {
    it('keeps null, undefined and numbers as they are, whatever the field', () => {
        expect(sanitizeShared(null)).toBeNull();
        expect(sanitizeShared(undefined)).toBeUndefined();
        expect(sanitizeShared(Number.NaN)).toBeNaN();
        expect(sanitizeShared(-0.5)).toBe(-0.5);
    });

    it('turns a string where a number is expected into a harmless string', () => {
        const clean = sanitizeShared({ streak: { max: '<svg onload=x>7' } });
        expect(clean.streak.max).toBe('svg onload=x7');
    });

    it('handles arrays nested in arrays and empty containers', () => {
        expect(sanitizeShared([['<a>'], [], {}])).toEqual([['a'], [], {}]);
    });

    it('strips quotes and angle brackets that could close an attribute', () => {
        expect(sanitizeShared('" onmouseover="alert(1)')).toBe(' onmouseover=alert(1)');
        expect(sanitizeShared('a"b<c>d')).toBe('abcd');
    });

    it('does not touch the input object', () => {
        const input = { name: '<b>Léo</b>' };
        sanitizeShared(input);
        expect(input.name).toBe('<b>Léo</b>');
    });
});

describe('serializeStats edge cases', () => {
    const base = () => ({
        startDate: new Date('2024-01-01T00:00:00Z'),
        endDate: new Date('2024-12-31T23:59:59Z'),
        total: 3,
    });

    it('drops the message body from firstMessage and longestMessage', () => {
        const stats = {
            ...base(),
            firstMessage: { datetime: new Date('2024-01-02T10:00:00Z'), message: 'secret one' },
            longestMessage: { datetime: new Date('2024-02-02T10:00:00Z'), message: 'secret two', length: 9 },
        };
        const s = serializeStats(stats);
        expect(s.firstMessage.message).toBeUndefined();
        expect(s.longestMessage.message).toBeUndefined();
        expect(s.longestMessage.length).toBe(9);
        expect(JSON.stringify(s)).not.toContain('secret');
    });

    it('serializes ghosting dates to ISO strings and keeps other fields', () => {
        const stats = { ...base(), ghosting: { longest: [{ who: 'Alice', hours: 40, when: new Date('2024-03-01T00:00:00Z') }] } };
        const s = serializeStats(stats);
        expect(s.ghosting.longest[0]).toEqual({ who: 'Alice', hours: 40, when: '2024-03-01T00:00:00.000Z' });
    });

    it('leaves firstMessage without a datetime alone', () => {
        const s = serializeStats({ ...base(), firstMessage: { message: 'x' } });
        expect(s.firstMessage).toEqual({ message: 'x' });
    });
});

describe('rehydrateDates robustness', () => {
    it('keeps values that are already Date instances', () => {
        const when = new Date('2024-03-01T00:00:00Z');
        const restored = rehydrateDates({
            startDate: new Date('2024-01-01T00:00:00Z'),
            endDate: new Date('2024-01-02T00:00:00Z'),
            ghosting: { longest: [{ when }] },
        });
        expect(restored.ghosting.longest[0].when).toBe(when);
    });

    it('does not crash on a payload missing optional blocks', () => {
        const input = { startDate: '2024-01-01T00:00:00.000Z', endDate: '2024-01-02T00:00:00.000Z' };
        const restored = rehydrateDates(input);
        expect(restored.startDate).toBeInstanceOf(Date);
        expect(restored.firstMessage).toBeUndefined();
        expect(restored.ghosting).toBeUndefined();
    });

    it('leaves non-string dates untouched (numbers are not reinterpreted)', () => {
        const restored = rehydrateDates({ startDate: 1700000000000, endDate: null });
        expect(restored.startDate).toBe(1700000000000);
        expect(restored.endDate).toBeNull();
    });

    it('rehydrates a ghosting entry whose when is a numeric timestamp', () => {
        const restored = rehydrateDates({ ghosting: { longest: [{ when: 0 }] } });
        expect(restored.ghosting.longest[0].when).toBeInstanceOf(Date);
        expect(restored.ghosting.longest[0].when.getTime()).toBe(0);
    });
});

describe('buildShareURL', () => {
    // Identity-like codec: keeps the length honest so the size budget is real.
    const codec = { compressToEncodedURIComponent: (s) => encodeURIComponent(s) };
    const decodeHash = (url) => JSON.parse(decodeURIComponent(url.split('#share=')[1]));
    const base = () => ({
        startDate: new Date('2024-01-01T00:00:00Z'),
        endDate: new Date('2024-12-31T00:00:00Z'),
        avgPerDay: 4,
        streak: { max: 12 },
    });

    beforeEach(() => {
        vi.stubGlobal('window', { location: { origin: 'https://chatwrap.test', pathname: '/index.html' } });
        vi.stubGlobal('LZString', codec);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('builds a URL on the current page with the payload in the hash', () => {
        const { url, truncated } = buildShareURL(base(), { a: 1 });
        expect(url.startsWith('https://chatwrap.test/index.html#share=')).toBe(true);
        expect(truncated).toBe(false);
        expect(decodeHash(url)).toEqual({
            s: {
                startDate: '2024-01-01T00:00:00.000Z',
                endDate: '2024-12-31T00:00:00.000Z',
                avgPerDay: 4,
                streak: { max: 12 },
            },
            c: { a: 1 },
        });
    });

    it('removes daily data when dropDaily is set', () => {
        const stats = { ...base(), daily: [{ d: '2024-01-01', n: 2 }] };
        const kept = decodeHash(buildShareURL(stats, null).url);
        const dropped = decodeHash(buildShareURL(stats, null, { dropDaily: true }).url);
        expect(kept.s.daily).toBeDefined();
        expect(dropped.s.daily).toBeUndefined();
    });

    it('does not mutate the stats it is given', () => {
        const stats = { ...base(), daily: [1, 2] };
        buildShareURL(stats, null, { dropDaily: true });
        expect(stats.daily).toEqual([1, 2]);
    });

    it('drops the heaviest trimmable field first when the link is too long', () => {
        const stats = {
            ...base(),
            monthly: Array.from({ length: 300 }, (_, i) => ({ month: `2024-${i}`, count: i })),
        };
        const { url, truncated } = buildShareURL(stats, null);
        expect(truncated).toBe(true);
        expect(url.length).toBeLessThanOrEqual(6000);
        const s = decodeHash(url).s;
        expect(s.monthly).toBeUndefined();
        expect(s.avgPerDay).toBe(4);
    });

    it('reports truncated=false and keeps the long URL when nothing can be trimmed', () => {
        const stats = { ...base(), notes: 'x'.repeat(7000) };
        const { url, truncated } = buildShareURL(stats, null);
        expect(truncated).toBe(false);
        expect(url.length).toBeGreaterThan(6000);
        expect(decodeHash(url).s.notes).toHaveLength(7000);
    });

    it('never embeds a message body from a real computed stats object', () => {
        const messages = parse(fixture('ios_fr.txt'));
        const { url } = buildShareURL(compute(messages), null);
        expect(url).not.toContain(encodeURIComponent('aide hier'));
        expect(url).not.toContain(encodeURIComponent('regardez ce lien'));
    });
});
